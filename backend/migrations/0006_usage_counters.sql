-- ============================================================================
-- 0006_usage_counters.sql
--
-- Generic per-clinic usage metering for everything that ISN'T an SMS/WhatsApp
-- credit: AI reply generations, email sends, manual sync operations.
--
-- WHY A GENERIC TABLE instead of more columns on subscriptions (the way
-- sms_credits_used works): every new metered thing would otherwise be a
-- migration + three service edits. Here a new metric is one string and one
-- limit in config/plans.js. The subscriptions counters stay where they are —
-- they're wired to Paddle's billing-period reset and moving them would churn
-- battle-tested code for zero benefit.
--
-- CONCURRENCY MODEL (same guarantee as credits.service.js, different shape):
-- one atomic INSERT ... ON CONFLICT DO UPDATE whose WHERE clause is the gate.
-- Two simultaneous requests both race the same row; Postgres serialises the
-- row update and only reservations that fit the limit return a row. No
-- SELECT-then-UPDATE window, no advisory locks, no transactions needed.
--
-- PERIOD MODEL: period_start is a DATE owned by the SERVICE, not the table —
--   monthly metrics → first of the current calendar month
--   daily metrics   → today
-- Old periods are simply new rows; history is retained for free (useful for
-- "your usage last month" later). Calendar months, not Paddle billing
-- periods, on purpose: billing anchors shift on upgrades and live in another
-- table, and "resets on the 1st" is what users expect a monthly cap to mean.
-- The tradeoff (a mid-month upgrader keeps their used count) is documented in
-- usage.service.js.
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_counters (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  -- 'ai_reply' | 'email' | 'review_sync' | 'competitor_sync' — validated in
  -- the service (METRICS), TEXT here so adding a metric never needs DDL.
  metric        TEXT        NOT NULL,
  period_start  DATE        NOT NULL,
  used          INTEGER     NOT NULL DEFAULT 0 CHECK (used >= 0),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The upsert target. One row per clinic per metric per period.
  CONSTRAINT uniq_usage_counter UNIQUE (clinic_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_clinic_period
  ON usage_counters(clinic_id, period_start);

-- reuse the updated_at trigger function from 0001
DROP TRIGGER IF EXISTS trg_usage_counters_set_updated_at ON usage_counters;
CREATE TRIGGER trg_usage_counters_set_updated_at
BEFORE UPDATE ON usage_counters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();