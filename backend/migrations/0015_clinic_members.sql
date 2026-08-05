-- ============================================================================
-- 0015 — Per-clinic membership and roles.
--
-- ── Why roles needed a table, not a column ──────────────────────────────────
-- users.role has existed since the first commit as ENUM('admin','user'), and
-- registration has always hardcoded 'admin'. Nothing anywhere reads it: there
-- is no restrictTo, no authorize, no isAdmin — the string is decoration. So
-- every account has, in practice, exactly one permission level: everything.
--
-- Adding a real role to that column would not have helped, because the data
-- model could not express a second person anyway. A clinic is reached through
-- clinics.user_id, a single owner pointer, and loadClinic resolves the tenant
-- with `Clinic.findOne({ where: { userId } })`. A "staff" user would therefore
-- have no clinic at all and get a 404 on every route — the role would be as
-- decorative as the column it replaced.
--
-- Membership is the thing that was missing. With this table a clinic can have
-- several users at different permission levels, loadClinic resolves through it,
-- and restrictTo() has something real to enforce.
--
-- ── The two roles ───────────────────────────────────────────────────────────
--   owner  full control, including billing and anything that changes what the
--          clinic pays or ends the account
--   staff  day-to-day work: reviews, replies, review requests, campaigns,
--          competitors, analytics — everything except the money
--
-- The split is deliberately drawn at "can this person spend or cancel", which
-- is the boundary a clinic owner actually cares about when handing an account
-- to a receptionist.
--
-- ── Scope note ──────────────────────────────────────────────────────────────
-- This is the AUTHORIZATION foundation, not a team-management feature. There is
-- no invite flow yet, so staff rows are created by an operator (see
-- scripts/add-clinic-member.js). The enforcement below is real regardless — it
-- is what an invite UI would sit on top of.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinic_role_enum') THEN
    CREATE TYPE clinic_role_enum AS ENUM ('owner', 'staff');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS clinic_members (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  UUID             NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id    UUID             NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       clinic_role_enum NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  -- One membership per person per clinic. This is also what makes the
  -- registration insert safely re-runnable.
  CONSTRAINT uniq_clinic_member UNIQUE (clinic_id, user_id),

  -- ── One clinic per person, enforced ───────────────────────────────────────
  -- loadClinic resolves the tenant with a single lookup and takes the first
  -- row. If a user could belong to two clinics, that lookup would pick one
  -- arbitrarily and the same person would land in a different tenant depending
  -- on row order — a silent, non-deterministic authorization bug, and one that
  -- showed up the first time this was exercised: a user who registered their
  -- own clinic and was then added as staff elsewhere kept resolving to their
  -- own, as owner.
  --
  -- The product has no clinic switcher, so "one clinic per person" is what the
  -- code actually implements. Stating it as a constraint means the database
  -- rejects the ambiguous state instead of the application quietly picking a
  -- side. Drop this constraint when a switcher and an explicit active-clinic
  -- concept exist — not before.
  CONSTRAINT uniq_member_user UNIQUE (user_id)
);

-- loadClinic's lookup is by user_id ("which clinic does this person belong
-- to?"), so that is the leading column.
CREATE INDEX IF NOT EXISTS idx_clinic_members_user
  ON clinic_members (user_id);

CREATE INDEX IF NOT EXISTS idx_clinic_members_clinic
  ON clinic_members (clinic_id);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every clinic that already exists has exactly one user — the person who
-- registered it — and they are its owner. Without this, loadClinic would stop
-- resolving for every existing account the moment it switched to membership.
INSERT INTO clinic_members (clinic_id, user_id, role)
SELECT c.id, c.user_id, 'owner'::clinic_role_enum
  FROM clinics c
 WHERE c.user_id IS NOT NULL
ON CONFLICT ON CONSTRAINT uniq_clinic_member DO NOTHING;

COMMENT ON TABLE clinic_members IS
  'Which users belong to which clinic, and at what permission level. The tenant boundary loadClinic resolves through; clinics.user_id remains the original-owner pointer.';
COMMENT ON COLUMN clinic_members.role IS
  'owner = full control including billing; staff = everything except billing and account termination.';
