# Deploying Kirtify

Everything needed to take this from a repository to a running product, in the
order it has to happen.

Two deployable units:

| Unit | What it is | Where it usually goes |
| :--- | :--- | :--- |
| `backend/` | Express API + two background loops | Any container host (Railway, Render, Fly, ECS) |
| `frontend/` | Static SPA built by Vite | Any static host (Vercel, Netlify, Cloudflare Pages) |

Plus one PostgreSQL 16 database.

---

## 0. Before you touch a server

Three things gate everything else. Start them now, because two of them are
somebody else's queue.

### The long-lead approvals

| Service | What it gates | Notes |
| :--- | :--- | :--- |
| **Google Business Profile API** | Review sync — the core product loop | Apply first; the longest wait by far |
| **Facebook App Review** | Facebook Page reviews | Needs `pages_show_list` + `pages_read_engagement` |
| **SendGrid sender verification** | Password reset, email verification, **team invitations** | DNS records; a day or two |
| **Paddle** | All revenue | Live account + two price IDs |
| **Twilio** | All SMS/WhatsApp — **required to boot in production** | India also needs DLT registration (weeks) |
| **Apify** *or* **DataForSEO** | Competitor tracking — **required to boot in production** | Either one; same day |

The app **refuses to start** rather than degrade silently when several of these
are half-configured. That is deliberate (see `backend/src/config/env.js`), but
it does mean each is a hard gate, not a soft one.

### Generate your secrets

```bash
# Three separate values. Never reuse one for another.
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # ACCESS_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # REFRESH_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_ENCRYPTION_KEY (must be 64 hex chars)
```

`TOKEN_ENCRYPTION_KEY` encrypts the OAuth grants in `platform_connections`.
**Losing it means every connected Google and Facebook account must reconnect.**
Store it wherever you store things you cannot regenerate.

### Decide your domain topology

This is the highest-consequence configuration decision in the whole deployment,
and getting it wrong fails silently.

| Topology | Set | Why |
| :--- | :--- | :--- |
| `app.example.com` + `api.example.com` (shared registrable domain) | `COOKIE_SAMESITE=lax` | Stronger CSRF posture, and the cookie still travels |
| `app.vercel.app` + API elsewhere (different domains) | leave **unset** | Production defaults to `none` + `Secure`, which is what a cross-site cookie requires |

Get this wrong in the split-domain direction and the refresh cookie is never
sent, `POST /auth/refresh-token` 401s every time, and **every user is logged out
the moment their 15-minute access token expires** — with nothing in the logs but
routine 401s.

---

## 1. Database

PostgreSQL **16**. Any managed provider (Neon, Supabase, RDS, Railway).

- The connection pool is `max: 15` **per instance** (`backend/src/config/db.js`).
  Keep `instances × 15` comfortably under the provider's `max_connections`.
- Nothing else is required. `gen_random_uuid()` is built in from PG 13 — no
  extensions to enable.

**Migrations run automatically at boot.** `initializeDatabase()` syncs the core
models, applies pending migrations, then asserts the schema — all before
`app.listen()`. A failure exits non-zero, so an orchestrator will not route
traffic to a container running against a broken schema. There is no separate
migrate step to sequence.

To run them by hand anyway:

```bash
cd backend
npm run migrate:status   # what has been applied
npm run migrate:check    # what is pending
npm run migrate          # apply
```

---

## 2. Backend

### Build and run

```bash
cd backend
docker build -t kirtify-api .
docker run --env-file .env.production -p 5000:5000 kirtify-api
```

The image runs as a non-root user, uses `dumb-init` as PID 1 so `SIGTERM`
actually reaches Node, and ships a `HEALTHCHECK` against `/health`.

The signal handling matters: `server.js` drains the campaign runner before
closing the pool. Without it, a rolling restart `SIGKILL`s a worker mid-send and
the at-most-once delivery logic has to clean up afterwards.

### Health checks

| Path | For |
| :--- | :--- |
| `GET /health` | Load balancers and platform probes |
| `GET /api/v1/health` | The SPA (its axios baseURL already includes `/api/v1`) |

Allow **40 seconds** of start-up before the first probe — migrations run first.

### Environment

`backend/.env.example` documents every variable and why it exists. The short
version:

**Required — the process exits at boot without these**

```
PORT  NODE_ENV  DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
ACCESS_TOKEN_SECRET  REFRESH_TOKEN_SECRET  CLIENT_URL
```

**Required specifically in production**

```
TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_PHONE_NUMBER
APIFY_TOKEN  (or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)
```

Both have deliberate escape hatches — `ALLOW_SIMULATED_SENDS=true` and
`ALLOW_MOCK_COMPETITOR_DATA=true` — for instances that genuinely never send or
that want fixture data. Setting either has to be a decision, because the default
cannot be "quietly pretend".

**All-or-nothing groups.** Set every variable in a group or none of them; a
partial set exits at boot. Google OAuth · Paddle · Facebook · SendGrid · MSG91 ·
Twilio · DataForSEO.

**Fatal in production if `true`**

```
REVIEWS_MOCK  GOOGLE_MOCK_DISCOVERY  FACEBOOK_MOCK_DISCOVERY
EMAIL_SIMULATE  DB_SYNC_ALTER
```

**Optional but strongly recommended**

```
SENTRY_DSN       # unset is fine — structured JSON logs to stderr regardless
SENTRY_RELEASE   # auto-detected from RAILWAY_GIT_COMMIT_SHA / RENDER_GIT_COMMIT / GIT_COMMIT
COOKIE_SAMESITE  # see the topology table above
API_PUBLIC_URL   # required if you use Google or Facebook OAuth, or Twilio inbound
                 # (safe to set on its own — it is not tied to Google)
```

### If email is not configured

Three things change, and they are worth knowing before someone reports them as
bugs:

- `POST /auth/forgot-password` returns **503**. There is no way to send a link,
  and pretending otherwise leaves people waiting on an email that was never
  coming.
- **Team invitations are refused.** An invitation *is* an email; a pending row
  nobody can accept looks identical to a sent one.
- **`requireVerifiedEmail` stops enforcing.** Demanding someone confirm an
  address over a channel you do not have is a lockout, not a security control.

### Scaling

Single instance is the right default. Both background loops are already
multi-instance safe — all work claiming is `FOR UPDATE SKIP LOCKED` — so you can
scale out when you need to. Two things to know first:

1. **Rate limiters use an in-memory store**, so caps are *per process*. Three
   instances means the login brute-force cap is effectively 30 failed attempts
   per 15 minutes rather than 10. Add a shared store when this matters.
2. To split web and worker roles, set `CAMPAIGN_RUNNER_DISABLED=true` and
   `SYNC_SCHEDULER_DISABLED=true` on the HTTP-only instances.

---

## 3. Frontend

```bash
cd frontend
VITE_API_URL=https://api.your-domain.com/api/v1 npm run build   # → dist/
```

**`VITE_API_URL` is inlined at BUILD time.** Setting it on the server afterwards
is too late — the bundle is already baked. `vite.config.js` fails the build
outright when it is missing rather than shipping a bundle that calls
`localhost`.

Set it in your host's build environment (Vercel → Settings → Environment
Variables), not in a committed `.env`.

| Variable | Needed for |
| :--- | :--- |
| `VITE_API_URL` | **Required.** Include the `/api/v1` suffix |
| `VITE_PADDLE_ENV` | `sandbox` or `production` |
| `VITE_PADDLE_CLIENT_TOKEN` | Paddle → Developer Tools → Authentication (the *public* token) |

`vercel.json` handles SPA routing, cache headers and security headers. Notes on
the CSP, since JSON cannot carry comments:

- `script-src` allows `cdn.paddle.com` — the only external script the app loads.
  Paddle v2 uses the same CDN for sandbox and production; the environment is
  selected in JS.
- `frame-src` allows Paddle's checkout overlay.
- `connect-src` is `'self' https:` because the API origin is a build-time
  variable and is not known when this file is written. Tighten it to your actual
  API origin once that is fixed.
- `img-src` allows `https:` for `api.dicebear.com` avatars.
- `style-src` needs `'unsafe-inline'` for Tailwind's injected styles and React
  inline styles. `script-src` does **not** — the built `index.html` has no
  inline scripts.

On a host other than Vercel, port those headers to its own configuration.

---

## 4. Webhooks and callbacks

Register these with the third parties once the API has a public URL:

| Provider | URL | Notes |
| :--- | :--- | :--- |
| Paddle | `{API_PUBLIC_URL}/api/v1/billing/webhook` | Signature is over **raw bytes** — never put a body parser or proxy transform in front of it |
| Twilio (inbound STOP) | `{API_PUBLIC_URL}/api/v1/webhooks/sms/inbound` | HMAC is computed over this **exact** URL — it must match byte for byte |
| Google OAuth | `{API_PUBLIC_URL}/api/v1/oauth/google/callback` | Register in Cloud Console |
| Facebook OAuth | `{API_PUBLIC_URL}/api/v1/oauth/facebook/callback` | Register in the Meta app |

---

## 5. Cutover

1. Provision Postgres. Note the connection details.
2. Deploy the **backend** with `NODE_ENV=production` and the full environment.
   Watch the boot log — it prints exactly which integrations it detected:
   ```
   🔌 Integrations: ✓ googleOAuth  ✓ paddle  · facebook  ✓ sendgrid  …
   🩺 Error reporting: Sentry (production @ a1b2c3d)
   ✅ Migrations: applied 17 (…)
   ✅ Schema assertion: 12 tables, 63 raw-SQL columns verified
   ✅ Server running on http://localhost:5000
   ```
   A `·` next to something you configured means it is **not** actually set.
3. Point DNS at the API. Confirm `GET /health` returns 200 over HTTPS.
4. Set `CLIENT_URL` to the SPA's final origin and redeploy the backend — CORS
   and every emailed link are built from it.
5. Build and deploy the **frontend** with `VITE_API_URL` pointing at the API.
6. Register the webhooks and OAuth callbacks from section 4.
7. Smoke test in this order — each step depends on the one before:
   - sign up → confirmation email arrives → click it
   - connect a review platform → "Sync now" → reviews appear
   - send one review request to your own phone
   - upgrade with a real card → confirm the plan changes in Settings
   - invite a colleague → they accept → they can sign in
   - request a password reset → the link works
   - **export your data, then delete the test account** — confirm the
     subscription is cancelled in Paddle afterwards

---

## 6. After launch

**Watch for**

- `[syncScheduler] CLAIM FAILED` — the review pipeline is not running. Reported
  to Sentry with the Postgres error code.
- `[campaigns] tick error` — the send loop is broken. Also reported.
- `[paddle webhook] invalid signature` — a body parser or proxy is mangling the
  raw body, or the webhook secret is wrong. Paying customers will be stuck on
  the free tier.
- Any 500 — each carries an `eventId` echoed in the response body, matching the
  structured log line and the Sentry event.

**Correlating a user report.** Every response carries `X-Request-Id`, and a 500's
body includes the same id as `eventId`. Ask for it, then grep.

**Backups.** Nothing in this repository configures them. Use your provider's
point-in-time recovery. Account deletion is immediate and permanent by design —
a customer who deletes and then changes their mind can only be restored from a
database backup.

---

## 7. Verifying a change before deploying

What CI runs, and what you can run locally:

```bash
# Backend — needs a throwaway Postgres; the helpers TRUNCATE
cd backend && npm test

# Frontend
cd frontend
npx eslint .
VITE_API_URL=https://api.example.com/api/v1 npm test
VITE_API_URL=https://api.example.com/api/v1 npm run build
```

Current state: **135 backend tests, 45 frontend tests**, zero lint errors.
