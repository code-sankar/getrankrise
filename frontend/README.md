# Kirtify

B2B SaaS reputation management and local SEO for clinics and local businesses.
Aggregates reviews from Google Business Profile, Yelp and Facebook into one
feed, drafts AI replies, tracks competitors, and runs SMS/WhatsApp review
request campaigns.

| | |
|---|---|
| **Frontend** | React + Vite, Redux Toolkit, Tailwind (obsidian dark theme) |
| **Backend** | Node.js / Express (ESM), Sequelize, PostgreSQL 14+ |
| **Billing** | Paddle Billing v2 — Merchant of Record |
| **Messaging** | Twilio (international SMS + all WhatsApp), MSG91 (India SMS) |
| **Reviews** | Google Business Profile v4, Yelp Fusion (read-only), Facebook Graph |

---

## Quick start

```bash
git clone <repo> && cd kirtify

# Backend
cd backend
npm install
cp .env.example .env          # fill in the REQUIRED block
createdb kirtify
npm run migrate               # see the runbook below before running on an existing DB
npm run dev

# Frontend (second terminal)
cd ../frontend
npm install
npm run dev
```

Backend on `:5000`, frontend on `:5173`.

### Running with zero third-party credentials

Every external dependency has an offline path, so a fresh clone is fully
clickable before a single API key exists:

```bash
REVIEWS_MOCK=true GOOGLE_MOCK_DISCOVERY=true FACEBOOK_MOCK_DISCOVERY=true \
EMAIL_SIMULATE=true npm run dev
```

Competitor tracking falls back to a deterministic mock provider with no flag.
SMS providers log instead of sending when unconfigured. All of these switches
are **fatal at boot** with `NODE_ENV=production`.

---

## Environment

`backend/.env.example` is the reference — it documents every variable and,
more usefully, the failure mode each one prevents. Three tiers:

- **REQUIRED** — the server exits at boot without them.
- **ALL-OR-NONE groups** — optional integrations. Setting *some* of a group's
  variables exits at boot. This is deliberate: an absent integration fails
  honestly at the edge ("Facebook isn't configured on the server yet"), while a
  half-configured one gets far enough to take the user's click, burn their
  quota, or accept a payment it cannot verify.
- **SWITCHES** — development conveniences, several fatal in production.

`src/config/env.js` prints a one-line integration summary at startup:

```
🔌 Integrations: ✓ googleOAuth  ✓ paddle  · facebook  ✓ sendgrid  · msg91  ✓ twilio  · dataForSeo  ✓ yelp  · apify  ✓ openai
```

so "is email configured on staging?" is answerable from the deploy log.

---

## Database

Two categories of table, and the distinction is load-bearing:

| | Owned by | Tables |
|---|---|---|
| **CORE** | `sequelize.sync()` from the models | users, clinics, reviews, requests, notifications, competitors, competitor_snapshots |
| **MIGRATED** | SQL files in `backend/migrations/` | subscriptions, webhook_events, platform_connections, campaigns, campaign_recipients, opt_outs |

**Never add a MIGRATED model to `CORE_MODELS` in `src/db/bootstrap.js`.**
Defining a model does not create its table; it teaches Sequelize to read one
migrations already own. Adding, say, `Campaign` to `CORE_MODELS` makes `sync()`
race migration 0007 for ownership of that table, with Sequelize inventing its
own ENUM type names. Whichever runs first wins, and the loser fails
mysteriously later.

Boot order is `authenticate → sync CORE → run migrations → assert schema`.
CORE first because MIGRATED tables carry foreign keys into them.

### Migration runbook

Migrations are plain `.sql` files, ordered lexicographically by a zero-padded
numeric prefix. No timestamps — they sort badly across branches and hide
dependency order. Each file runs inside one transaction opened by the runner,
so **never put `BEGIN`/`COMMIT` inside a migration file**. If a statement can't
run in a transaction (`CREATE INDEX CONCURRENTLY`, some `ALTER TYPE`), start
the file with `-- umzug:no-transaction`.

There is no `down` step, by design. Roll forward with a new migration.

```bash
npm run migrate            # apply everything pending
npm run migrate:status     # applied vs pending
node migrate.js pending    # exit 1 if anything is outstanding — for CI gates
```

The server also applies pending migrations on boot, so a deploy can never
serve traffic against a stale schema. The CLI exists for inspection,
baselining, and running migrations as a separate step ahead of a rolling
restart.

#### Baselining an existing database

Only needed **once**, on a database created before the migration runner
existed, where `2026_06_14_subscriptions.sql` and/or
`20260615_fix_clinic_plan_enum.sql` were applied by hand. Without baselining,
the first boot tries to re-run them and fails on `CREATE TYPE ... already
exists`.

```bash
npm run migrate:baseline   # records 0001 and 0002 as applied WITHOUT running them
npm run migrate            # then apply everything genuinely pending
```

On a fresh database, skip this entirely — `npm run migrate` is correct.

#### Adding a migration

1. `backend/migrations/00NN_short_description.sql`, next free number.
   Check `ls backend/migrations` — numbers have been skipped before.
2. Make it idempotent (`IF NOT EXISTS`, guarded `DO $$` blocks). Applied files
   never re-run, so this isn't strictly required — it's cheap insurance
   against a half-applied deploy.
3. If it adds a column a Sequelize model reads, **update the model in the same
   commit**. Model/migration drift is the bug class that produced silently
   dropped `country_code` values.
4. If hand-written SQL will name the column, add it to
   `src/db/assertSchema.js`.

### The schema assertion

`src/db/assertSchema.js` runs after migrations on every boot and verifies that
every column named by hand-written SQL actually exists. Startup aborts with a
list of what's missing.

It exists because `CLAIM_SQL` in the sync scheduler read
`subscriptions.status` and `subscriptions.plan` for an entire development
phase. The real columns are `subscription_status` and `plan_type`. Postgres
raised `42703` on every tick; the tick's `try/catch` reduced it to one line of
`console.error`; and a scheduler that claims nothing is indistinguishable from
a scheduler with nothing due. Automatic review sync — the core product loop —
had never run once, in any environment. Sequelize catches this class of bug on
model attributes but cannot see inside `sequelize.query()`, and this codebase
uses raw SQL for every concurrency-critical path on purpose. This is the price
of that trade.

---

## Background loops

Both start with the server and both are **multi-instance safe with no Redis
and no queue**, because every work-claiming step is a single atomic Postgres
statement using `FOR UPDATE SKIP LOCKED`. N instances process disjoint work.

| Loop | File | Disable with |
|---|---|---|
| Campaign runner | `services/campaigns/campaignRunner.service.js` | `CAMPAIGN_RUNNER_DISABLED=true` |
| Sync scheduler | `services/reviews/syncScheduler.service.js` | `SYNC_SCHEDULER_DISABLED=true` |

The flags let web and worker roles be split later without code changes.

**Claim-by-stamping** (sync scheduler): the claim `UPDATE` sets
`last_synced_at = NOW()` *before* the sync runs. That stamp is the claim — the
plan interval itself is the lease, so there's no `processing` status, no
`claimed_at`, and no stuck-row sweeper. Consequences are deliberate: a failed
sync isn't retried until the next interval (that's the backoff), and a crashed
worker loses at most one interval per claimed connection (the upsert is
idempotent).

This is also why the free-tier backfill needs its own `initial_sync_at`
column. `last_synced_at` answers "has this been claimed?", not "has this ever
produced data?" — and the free tier's whole ingestion story depends on the
second question.

Shutdown drains campaigns before syncs: an interrupted send batch risks a
double-send on retry, while an interrupted review sync just re-runs an
idempotent upsert.

---

## Plans and enforcement

`backend/src/config/plans.js` is the single source of truth. The frontend may
render whatever plan UI it likes; every limit is enforced server-side from
that file.

| | Free | Starter ($49) | Premium ($99) |
|---|---|---|---|
| Stored reviews | 20 | unlimited | unlimited |
| Automatic sync | one-time backfill only | every 24h | every 1h |
| AI replies | — | 200/mo | 1000/mo |
| Competitors | — | 3 | 10 |
| SMS / WhatsApp | — | 50 / — | 500 / 500 |

Plan state comes from `subscriptions.plan_type` via
`services/subscription/subscriptionState.service.js` — **never** from
`clinics.plan`, which is a denormalised mirror kept in sync by the Paddle
webhook for admin reads only.

Two enforcement mechanisms, and each wall should use exactly one:

- `requireFeature("...")` middleware — boolean plan gates, returns
  `403 UPGRADE_REQUIRED`.
- Meter reservations (`reserveCredits` / `reserveUsage`) — countable budgets,
  reserved before the send and refunded on provider failure. Same 403 shape.

Adding a second gate in front of a metered route gives users two different
errors for the same wall. The frontend axios interceptor pattern-matches that
403 into the upgrade modal.

---

## Known external blockers

Neither is a code problem; both take real calendar time. Start them early.

1. **Google Business Profile API** ships at quota 0 until Google approves your
   access request — days to weeks. Until then real reads return
   `RESOURCE_EXHAUSTED`, surfaced as `GBP_NOT_APPROVED`.
2. **Facebook App Review** for `pages_read_engagement` is required to read
   ratings for Pages the developer doesn't own. The OAuth handshake works
   before review; only ratings reads are gated.

Yelp Fusion needs no approval but caps at 3 truncated reviews per business and
has no reply API on the standard tier. That ceiling is Yelp's.

---

## Deploy checklist

- [ ] `node migrate.js pending` exits 0
- [ ] Boot log shows the schema assertion passing
- [ ] `NODE_ENV=production` (this makes every mock switch fatal)
- [ ] `PADDLE_ENVIRONMENT=production` and the webhook points at
      `{API_PUBLIC_URL}/api/v1/billing/webhook`
- [ ] OAuth redirect URIs registered for the production `API_PUBLIC_URL`
- [ ] Twilio inbound webhook points at
      `{API_PUBLIC_URL}/api/v1/webhooks/sms/inbound` — without it, STOP replies
      are never recorded (TCPA/TRAI exposure)
- [ ] `TOKEN_ENCRYPTION_KEY` backed up somewhere recoverable. Losing it means
      every clinic reconnects every platform.
- [ ] Cross-domain deploys: the refresh cookie's `sameSite: "strict"` needs
      revisiting if the API and app are on different origins

---

## Troubleshooting

**Scheduler logs `CLAIM FAILED` every tick** — schema drift. Run
`npm run migrate` and check the assertion output at boot.

**Reviews sync but the dashboard is empty** — the Dashboard fetches on mount;
confirm `GET /api/v1/reviews` returns rows for that clinic. On the Free tier
check `cappedByPlan`; the list is capped at 20 by design.

**Paddle webhooks all 401** — the raw-body invariant. The webhook route must
be registered in `app.js` **before** `express.json()`, because the HMAC is
computed over exact raw bytes. There must be exactly one webhook route, and it
must not live in `billing.routes.js`.

**A free clinic has no reviews after connecting** — check
`platform_connections.initial_sync_at` and `initial_sync_error`. The one-time
backfill retries 5 times, 6 hours apart, then stops; reconnecting resets it.

**WhatsApp fails for Indian numbers** — expected if only MSG91 is configured.
MSG91 is SMS-only; WhatsApp always routes through Twilio regardless of country.

**Phone numbers rejected by the campaign CSV import** — E.164 required
(`+919876543210`). Trunk-zero (`09876543210`) is rejected.