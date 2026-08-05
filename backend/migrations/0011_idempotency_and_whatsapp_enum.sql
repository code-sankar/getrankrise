-- umzug:no-transaction
-- ============================================================================
-- 0011 — Send idempotency, at-most-once campaign delivery, and the missing
--        WhatsApp value on the requests.send_via enum.
--
-- Runs OUTSIDE a transaction because of the ALTER TYPE ... ADD VALUE below.
-- PostgreSQL 12+ permits that inside a transaction only if the new label is
-- not used in the same transaction, and older servers reject it outright.
-- Every statement here is IF NOT EXISTS / idempotent, so a partial apply is
-- safe to re-run rather than something to hand-repair.
--
-- ── 1. requests.idempotency_key ─────────────────────────────────────────────
-- POST /api/v1/requests accepted an `idempotencyKey` in its Joi schema, whose
-- comment promised that "if same key sent twice within 24h, second request
-- returns the original result instead of double-charging SMS credits". No
-- column, no lookup and no dedupe existed anywhere — the key was threaded down
-- to the SMS providers, which destructure only { to, body } and drop it. A
-- double-clicked Send button therefore charged the clinic twice and texted the
-- patient twice. This column plus the partial unique index below is the
-- storage that guarantee always needed.
--
-- The index is PARTIAL (WHERE idempotency_key IS NOT NULL) because the key is
-- optional: without the predicate, every legacy row's NULL would collide under
-- a plain UNIQUE in some engines and the constraint would be unusable. It is
-- scoped per clinic, not global, so two clinics can independently choose the
-- same client-generated key.
--
-- ── 2. campaign_recipients.send_started_at ──────────────────────────────────
-- campaignRunner's crash-recovery sweep returns any 'processing' row older
-- than 10 minutes to 'pending'. That is correct ONLY for rows whose provider
-- call never happened. A worker that died between a successful Twilio send and
-- the "mark sent" write left a row that had already delivered an SMS — and the
-- sweep re-queued it, re-reserved a credit, and sent the patient a duplicate.
-- The header comment claimed the idempotencyKey passed to the provider was a
-- "provider-level double-send guard"; Twilio's Messages API has no such
-- parameter and the provider ignored it.
--
-- Stamping this column immediately BEFORE the provider call converts the
-- recovery sweep from at-least-once to at-most-once: a row with a stamp and no
-- terminal status is "we do not know whether this delivered", which for SMS
-- must resolve to "do not send again" — a missed review request is recoverable,
-- a duplicate charge plus a duplicate text to a patient is not.
--
-- ── 3. enum_requests_send_via += 'WhatsApp' ─────────────────────────────────
-- validate.middleware.js has always accepted sendVia:"WhatsApp", and
-- request.controller.js reserves a WhatsApp credit and calls the provider for
-- it. But `requests` is a CORE table created by sequelize.sync() from
-- models/Request.js, whose ENUM was ("SMS","Email","Both"). So a WhatsApp send
-- reserved the credit, DELIVERED the message, then threw 22P02 on the insert,
-- fell into the catch, refunded, and returned a 500. The patient got the
-- message; the clinic got an error and no record. Premium's headline channel
-- could not complete a single send.
-- ============================================================================

-- ── 1. Request-level idempotency ────────────────────────────────────────────
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80);

COMMENT ON COLUMN requests.idempotency_key IS
  'Client-supplied dedupe key. Unique per clinic where present; a repeat send with the same key returns the stored row instead of re-charging and re-sending.';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_requests_clinic_idempotency
  ON requests (clinic_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2. At-most-once campaign delivery ───────────────────────────────────────
ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ;

COMMENT ON COLUMN campaign_recipients.send_started_at IS
  'Stamped immediately before the provider call. Set + non-terminal status = delivery outcome unknown; the recovery sweep must fail it, never re-send it.';

-- Partial index for the recovery sweep, which only ever scans stuck
-- 'processing' rows. Keeps that sweep off a full scan of the work queue as
-- campaign_recipients grows.
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_stuck
  ON campaign_recipients (claimed_at)
  WHERE status = 'processing';

-- ── 3. WhatsApp on the requests.send_via enum ───────────────────────────────
-- Guarded by the catalog lookup as well as IF NOT EXISTS: on a FRESH database
-- sequelize.sync() builds this type from the model (which now includes
-- WhatsApp) before migrations run, making this a no-op. On an EXISTING
-- database the type predates the model change and this adds the label.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_requests_send_via') THEN
    ALTER TYPE enum_requests_send_via ADD VALUE IF NOT EXISTS 'WhatsApp';
  END IF;
END
$$;
