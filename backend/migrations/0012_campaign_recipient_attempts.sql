-- ============================================================================
-- 0012 — Bound the campaign recovery sweep with an attempt counter.
--
-- Migration 0011 split requeueStuck into "never sent → retry" and "outcome
-- unknown → fail closed", which stopped the duplicate-send bug. It did not
-- bound the FIRST branch. A recipient that is claimed and then abandoned
-- before the send_started_at stamp — a worker OOM-killed mid-batch, a
-- deploy-time SIGKILL landing in the same window, a row whose phone number
-- makes reserveCredits throw — returns to 'pending', gets claimed again,
-- and repeats every STUCK_MINUTES forever.
--
-- Nothing about that loop is visible: each pass logs nothing, the campaign
-- never completes (maybeComplete requires zero pending|processing rows), and
-- the campaign sits at "running" indefinitely with a recipient count that
-- never moves. The sync scheduler already solved this exact problem with
-- platform_connections.initial_sync_attempts; this mirrors it.
--
-- attempts counts CLAIMS, not sends. It is incremented by the claim itself
-- rather than by the requeue, so the cap bounds total work done on a
-- recipient regardless of which branch keeps returning it to the queue.
-- ============================================================================

ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN campaign_recipients.attempts IS
  'Number of times this recipient has been claimed by a worker. Bounded by MAX_ATTEMPTS in campaignRunner.service.js; exceeding it fails the row rather than looping the recovery sweep forever.';

-- The claim query filters on (campaign_id, status) and now also attempts.
-- Without this the claim degrades to a seq scan on large campaigns once the
-- extra predicate stops the planner using a status-only index.
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_claimable
  ON campaign_recipients (campaign_id, created_at)
  WHERE status = 'pending';
