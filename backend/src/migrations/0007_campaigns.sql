-- ============================================================================
-- 0007_campaigns.sql
--
-- Pulse Campaigns: bulk review-request sends over SMS/WhatsApp with
-- scheduling, throttling, and opt-out compliance.
--
-- THREE TABLES:
--   campaigns            one row per campaign; status drives the runner
--   campaign_recipients  one row per (campaign, phone); THE WORK QUEUE —
--                        the runner claims pending rows with
--                        FOR UPDATE SKIP LOCKED, so multiple app instances
--                        process disjoint batches with no double-sends and
--                        no Redis. (Pattern: the lock-skip-locked reference
--                        already in this repo's .agents/skills.)
--   opt_outs             suppression list. clinic_id NULL = GLOBAL row
--                        (inbound STOP arrives on a shared Twilio number
--                        with no way to attribute a clinic, so STOP
--                        suppresses the phone platform-wide — the
--                        compliance-safe reading of TCPA/TRAI).
--
-- STATUS MACHINES (enforced in service code; TEXT here so evolving them
-- never needs DDL — same convention as subscriptions):
--   campaign:  draft → scheduled → running → completed
--                              ↘ paused (resumable) / canceled / failed
--   recipient: pending → processing → sent | failed
--                      ↘ skipped_opt_out | skipped_invalid | skipped_no_credits
--
-- 'processing' exists for crash recovery: a worker that dies mid-batch leaves
-- rows in processing; the runner requeues any processing row older than 10
-- minutes back to pending (claimed_at powers that sweep).
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                 VARCHAR(150) NOT NULL,
  channel              TEXT        NOT NULL,                -- 'SMS' | 'WhatsApp'
  message_template     TEXT        NOT NULL,                -- {{name}} {{clinic}} {{link}}
  status               TEXT        NOT NULL DEFAULT 'draft',
  scheduled_at         TIMESTAMPTZ,                         -- NULL = start manually
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  throttle_per_minute  INTEGER     NOT NULL DEFAULT 10
                                   CHECK (throttle_per_minute BETWEEN 1 AND 60),
  -- Denormalised progress counters, updated by the runner per batch — the
  -- list endpoint renders progress bars without a GROUP BY per row.
  total_recipients     INTEGER     NOT NULL DEFAULT 0,
  sent_count           INTEGER     NOT NULL DEFAULT 0,
  failed_count         INTEGER     NOT NULL DEFAULT 0,
  skipped_count        INTEGER     NOT NULL DEFAULT 0,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_clinic ON campaigns(clinic_id);
-- Powers the runner's "what needs work" scans.
CREATE INDEX IF NOT EXISTS idx_campaigns_runnable
  ON campaigns(status, scheduled_at)
  WHERE status IN ('scheduled', 'running');

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- Denormalised from the campaign: opt-out checks and per-clinic reporting
  -- join on this without going through campaigns every time.
  clinic_id    UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name         VARCHAR(100),
  phone        VARCHAR(20) NOT NULL,                        -- normalised E.164
  status       TEXT        NOT NULL DEFAULT 'pending',
  error        TEXT,
  provider_id  VARCHAR(255),                                -- Twilio SID / MSG91 id
  claimed_at   TIMESTAMPTZ,                                 -- crash-recovery sweep
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- In-campaign dedupe: the same phone imported twice sends once.
  CONSTRAINT uniq_campaign_phone UNIQUE (campaign_id, phone)
);

-- THE claim index: the runner's SELECT ... WHERE campaign_id=? AND
-- status='pending' LIMIT n FOR UPDATE SKIP LOCKED walks exactly this.
CREATE INDEX IF NOT EXISTS idx_recipients_claim
  ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_recipients_phone
  ON campaign_recipients(phone);

CREATE TABLE IF NOT EXISTS opt_outs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = global suppression (inbound STOP). Non-null = one clinic's list
  -- (manual add, import flag).
  clinic_id   UUID        REFERENCES clinics(id) ON DELETE CASCADE,
  phone       VARCHAR(20) NOT NULL,
  channel     TEXT,                                          -- NULL = all channels
  source      TEXT        NOT NULL,                          -- 'inbound_stop'|'manual'|'import'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Postgres treats NULLs as distinct in unique constraints, so global rows
-- need their own partial index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_optout_clinic
  ON opt_outs(clinic_id, phone) WHERE clinic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_optout_global
  ON opt_outs(phone) WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_optout_phone ON opt_outs(phone);

-- updated_at trigger (function from 0001) — campaigns only; recipients and
-- opt_outs are effectively append/transition rows where created_at suffices.
DROP TRIGGER IF EXISTS trg_campaigns_set_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_set_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();