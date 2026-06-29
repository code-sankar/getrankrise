-- ── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE plan_type_enum AS ENUM ('free', 'starter', 'premium');

CREATE TYPE subscription_status_enum AS ENUM (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'paused',
  'incomplete'
);

-- ── Subscriptions table ────────────────────────────────────────────────────
-- One row per clinic. Source of truth for billing state. Always updated by
-- webhook handler, never by application code directly.
CREATE TABLE subscriptions (
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

CREATE INDEX idx_subs_gateway_sub_id   ON subscriptions(gateway_subscription_id);
CREATE INDEX idx_subs_gateway_cust_id  ON subscriptions(gateway_customer_id);
CREATE INDEX idx_subs_plan_status      ON subscriptions(plan_type, subscription_status);

-- ── Auto-update updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscriptions_set_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Webhook event log (idempotency + audit) ────────────────────────────────
-- Paddle retries webhooks. We must process each event_id only once.
CREATE TABLE webhook_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(20)  NOT NULL,           -- 'paddle'
  event_id        VARCHAR(255) NOT NULL UNIQUE,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB        NOT NULL,
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);

-- ── Backfill: give every existing clinic a free subscription ───────────────
INSERT INTO subscriptions (clinic_id, plan_type, subscription_status)
SELECT id, 'free', 'active' FROM clinics
ON CONFLICT (clinic_id) DO NOTHING;