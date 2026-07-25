-- ============================================================================
-- 0001_subscriptions_and_webhook_events.sql
--
-- Consolidated from: backend/src/migrations/2026_06_14_subscriptions.sql
--
-- Creates the billing source of truth (`subscriptions`) and the webhook
-- idempotency log (`webhook_events`).
--
-- Changes from the original file:
--   * BEGIN/COMMIT removed — src/db/migrator.js wraps every migration in a
--     transaction. Leaving them in would nest transaction blocks.
--   * CREATE TYPE / CREATE TABLE / CREATE INDEX made idempotent, so a
--     half-applied deploy can be re-run without hand-editing anything.
--   * gen_random_uuid() requires pgcrypto on Postgres < 13; the extension line
--     below makes that explicit rather than assumed.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type_enum') THEN
    CREATE TYPE plan_type_enum AS ENUM ('free', 'starter', 'premium');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
    CREATE TYPE subscription_status_enum AS ENUM (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'paused',
      'incomplete'
    );
  END IF;
END $$;

-- ── Subscriptions table ────────────────────────────────────────────────────
-- One row per clinic. Source of truth for billing state. Written by the Paddle
-- webhook handler; the credit counters are written by credits.service.js.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 UUID         NOT NULL UNIQUE
                                         REFERENCES clinics(id) ON DELETE CASCADE,

  plan_type                 plan_type_enum            NOT NULL DEFAULT 'free',
  subscription_status       subscription_status_enum  NOT NULL DEFAULT 'active',

  -- Paddle identifiers
  gateway_customer_id       VARCHAR(255),
  gateway_subscription_id   VARCHAR(255) UNIQUE,
  gateway_price_id          VARCHAR(255),

  -- Billing period
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  trial_ends_at             TIMESTAMPTZ,
  canceled_at               TIMESTAMPTZ,

  -- Monthly usage (resets when current_period_start rolls forward)
  sms_credits_used          INTEGER      NOT NULL DEFAULT 0,
  whatsapp_credits_used     INTEGER      NOT NULL DEFAULT 0,
  credits_reset_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_gateway_sub_id  ON subscriptions(gateway_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subs_gateway_cust_id ON subscriptions(gateway_customer_id);
CREATE INDEX IF NOT EXISTS idx_subs_plan_status     ON subscriptions(plan_type, subscription_status);

-- ── Auto-update updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_set_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Webhook event log (idempotency + audit) ────────────────────────────────
-- Paddle retries webhooks until it receives a 2xx. The UNIQUE constraint on
-- event_id is what makes replay safe: we INSERT ... ON CONFLICT DO NOTHING and
-- treat zero affected rows as "already handled".
CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(20)  NOT NULL,           -- 'paddle'
  event_id        VARCHAR(255) NOT NULL UNIQUE,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB        NOT NULL,
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);

-- ── Backfill: give every existing clinic a free subscription ───────────────
-- New signups get their row transactionally at registration
-- (services/subscription/provisionSubscription.service.js). This covers the
-- clinics that predate that change.
INSERT INTO subscriptions (clinic_id, plan_type, subscription_status)
SELECT id, 'free', 'active' FROM clinics
ON CONFLICT (clinic_id) DO NOTHING;