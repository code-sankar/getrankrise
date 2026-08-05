-- ============================================================================
-- 0017 — Team invitations.
--
-- ── What this finishes ──────────────────────────────────────────────────────
-- Migration 0015 built the authorization foundation: clinic_members, the
-- owner/staff split, loadClinic resolving the tenant through membership, and
-- restrictTo() enforcing it. Its own header said the missing piece was an
-- invite flow, and that "staff rows are created by an operator (see
-- scripts/add-clinic-member.js)".
--
-- So the permission model was real and completely unreachable: adding a
-- receptionist required shell access to the production box. This table is the
-- flow that makes it a product feature. scripts/add-clinic-member.js is
-- retired in the same change.
--
-- ── Why not reuse auth_tokens (0016) ────────────────────────────────────────
-- An invitation is not "a token belonging to a user". It carries the clinic,
-- the role being granted and who granted it, and — the part that decides it —
-- it is addressed to an email that may have NO account yet. Accepting one can
-- CREATE the user. auth_tokens.user_id is NOT NULL and references users(id),
-- which an invitation cannot satisfy at the moment it is issued.
--
-- ── One live invitation per (clinic, email) ─────────────────────────────────
-- Partial unique below, same reasoning as auth_tokens: re-inviting the same
-- person must replace their pending invitation rather than leave two working
-- links in two emails. Accepted and revoked rows fall out of the index so the
-- history survives and re-inviting someone who left still works.
--
-- Email is indexed lower() because addresses are case-insensitive in practice
-- and "Owner@clinic.com" must not be able to hold a second live invitation
-- alongside "owner@clinic.com".
--
-- ── The one-clinic-per-person constraint still applies ──────────────────────
-- clinic_members.uniq_member_user (0015) means a user belongs to exactly one
-- clinic, because loadClinic takes the first membership row and the product
-- has no clinic switcher. Accepting an invitation while already a member of
-- another clinic is therefore refused in the controller with an explanation,
-- rather than being allowed to hit a raw constraint violation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinic_invitations (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID             NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Who it was sent to. Stored as entered for display; matched case-insensitively.
  email            VARCHAR(150)     NOT NULL,

  -- What they get on acceptance. Defaults to staff — handing out ownership
  -- should be a deliberate act, not what happens when the field is omitted.
  role             clinic_role_enum NOT NULL DEFAULT 'staff',

  -- SHA-256 hex of the emailed secret. Never the secret itself. See 0014/0016.
  token_hash       CHAR(64)         NOT NULL UNIQUE,

  -- ON DELETE SET NULL: if the inviter's account is later removed, the
  -- invitation is still a valid record of what was granted and to whom.
  invited_by       UUID             REFERENCES users(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ      NOT NULL,

  accepted_at      TIMESTAMPTZ,
  accepted_user_id UUID             REFERENCES users(id) ON DELETE SET NULL,

  revoked_at       TIMESTAMPTZ,
  revoked_reason   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_invitation_pending
  ON clinic_invitations (clinic_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- The members screen lists a clinic's pending invitations alongside its
-- members, so this is the read path.
CREATE INDEX IF NOT EXISTS idx_clinic_invitations_clinic
  ON clinic_invitations (clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_invitations_expires
  ON clinic_invitations (expires_at);

COMMENT ON TABLE clinic_invitations IS
  'Pending and historical invitations to join a clinic. Accepting one writes the clinic_members row; the token itself is never stored, only its SHA-256.';
COMMENT ON COLUMN clinic_invitations.role IS
  'The clinic_members.role granted on acceptance. Defaults to staff.';
COMMENT ON COLUMN clinic_invitations.accepted_user_id IS
  'The user who accepted. May differ from any pre-existing account if acceptance created one.';
