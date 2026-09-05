# OAuth Consent Screen Verification

`business.manage` is a **restricted scope**, so Google requires this
verification independently of the API access request in file 01 — approval on
one does not grant the other, and they're reviewed by different teams on
different timelines. Start both the same week.

Do this in Google Cloud Console → **APIs & Services → OAuth consent screen**.

---

## Prerequisites Google checks before it will even queue the review

- [ ] **App homepage** on a domain you've verified in
      [Search Console](https://search.google.com/search-console) —
      `< https://kirtify.com >`
- [ ] **Privacy Policy URL**, live, describing this Google integration by name
      (see file 03) — `< https://kirtify.com/privacy >`
- [ ] **Authorized domain**: `< kirtify.com >` (must match the homepage and
      privacy policy domains)
- [ ] **Authorized redirect URI**, exact match, byte for byte:
      `https://< your API domain >/api/v1/oauth/google/callback`
      — this is `API_PUBLIC_URL` from your backend `.env`; the code builds the
      redirect from that variable, so whatever you set there is what must be
      registered here
- [ ] **App logo** (120×120px minimum)
- [ ] **Support email** the reviewer can actually reach you at

## Scopes to declare

Add exactly one restricted scope:

```
https://www.googleapis.com/auth/business.manage
```

Do not add broader scopes "to be safe" — a consent screen requesting more than
the code uses is itself a rejection reason, and this app requests only the one
scope above (`googleAuth.service.js`, `GOOGLE_SCOPES`).

## The demo video

This is the part people underestimate. Google requires a screen recording,
**not** slides, showing the actual consent flow in your **live, deployed**
app — not localhost, not a design mockup. 3–5 minutes, screen + voice
narration, unlisted YouTube link (not "private" — the reviewer can't request
access to a private video).

Script, scene by scene, matched to what the code actually does:

**1. Show the app before connecting (10s)**
Load Settings → Integrations on a real account with nothing connected yet.
Say: *"Kirtify is a reputation-management platform. Right now this clinic
has no review source connected."*

**2. Start the connection (20s)**
Click "Connect Google Business Profile." Narrate: *"This starts an OAuth flow
requesting the business.manage scope, which is what lets the business reply
to its own reviews."*

**3. The real Google consent screen (30s)**
Let this play out fully and unedited — sign in, the actual Google consent
screen naming the scope, granting it. **Do not cut this**; reviewers watch
for whether the consent screen shown matches what was declared.

**4. Location picker (15s)**
Show the account/location list the app fetched
(`accounts.locations.list`), and pick one. Say: *"The business picks which
of their locations to connect — Kirtify only ever touches this one location
after this."*

**5. Reviews arrive (20s)**
Back in the app, show reviews populating from that location. Say: *"Kirtify
reads star rating, review text and timestamp from Google Business Profile."*

**6. Reply and publish (30s)**
Open one unanswered review, show (or generate) a reply draft, click Send.
Say: *"The business owner writes or approves this reply, and Kirtify
publishes it back to Google Business Profile through the same API."* If you
can, flip to the Google Business Profile dashboard and show the reply landed
there — that single shot answers most of a reviewer's remaining questions.

**7. Disconnect (15s)**
Settings → Integrations → Disconnect. Say: *"Disconnecting revokes the
token at Google immediately and deletes it from our database."*

## The written justification (paste into the verification form)

> Kirtify requests `https://www.googleapis.com/auth/business.manage` so a
> connected business can (1) read its own Google Business Profile reviews
> into a unified inbox alongside its Yelp and Facebook reviews, and (2)
> publish a reply the business owner has written or approved back to that
> same review. No other use of the scope is made: Kirtify does not edit
> business listing information, does not manage posts, and does not access
> any location the connecting user has not explicitly selected.
>
> Access is per-customer and isolated: each business grants its own consent
> and Kirtify enforces that a business can only ever act on the location(s)
> that business connected. Tokens are encrypted at rest (AES-256-GCM) and are
> revoked at Google and deleted from our database the moment a customer
> disconnects.

## Timeline expectations

Restricted-scope verification runs **weeks**, sometimes longer if the reviewer
asks a follow-up (check your support inbox — this is the most common reason
verification stalls silently). Submit this the same day as file 01; do not
wait for one to clear before starting the other.
