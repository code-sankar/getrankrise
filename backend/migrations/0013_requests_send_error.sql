-- ============================================================================
-- 0013 — Record WHICH half of a "Both" send failed.
--
-- sendVia "Both" fans out to two independent providers: an SMS through Twilio/
-- MSG91, then an email through SendGrid. They fail independently, but the
-- controller treated the pair as one atomic operation — a single try/catch
-- around both, whose catch refunded EVERY reservation and destroyed the
-- request row.
--
-- So when the SMS was delivered and the email then threw, the outcome was:
--   * the patient had the text (real money already spent at the carrier)
--   * the SMS credit was refunded, as if nothing had been sent
--   * the requests row was deleted, releasing the idempotency claim
--   * the caller got a 500 and would reasonably retry
--   * the retry, with the same idempotency key, found no prior row and TEXTED
--     THE PATIENT A SECOND TIME
--
-- The controller now settles each channel separately and only refunds the ones
-- that genuinely failed. This column is where the surviving row records the
-- half that did not go out, so a partial send is visible in the send history
-- instead of looking like a clean success.
--
-- Nullable with no default: NULL means "nothing went wrong", which is the
-- overwhelmingly common case and costs nothing to store.
-- ============================================================================

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS send_error TEXT;

COMMENT ON COLUMN requests.send_error IS
  'Why part of this send failed, when at least one channel succeeded. NULL when every requested channel was delivered. Set by request.controller.js; a fully-failed send has no row at all, because the idempotency claim is released so the caller can retry.';
