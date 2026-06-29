-- ============================================================================
-- Migration: fix clinics.plan ENUM
-- From: ('starter', 'growth', 'agency')   default 'starter'
-- To:   ('free', 'starter', 'premium')    default 'free'
--
-- Why: config/plans.js (the source of truth for limits) and changePlanSchema
-- both use free/starter/premium, but the Clinic model ENUM was never updated.
-- Result: new signups silently defaulted to "starter" (paid features for free),
-- and any attempt to set "free"/"premium" via the API threw an ENUM error.
--
-- Postgres cannot rename/remove ENUM values or remap column data via
-- sync({ alter: true }), so this must be run as a one-off migration.
--
-- Safe to run once. The guard below makes it a no-op on a fresh DB (where the
-- type doesn't exist yet — sync creates the correct ENUM directly) and on a DB
-- that has already been migrated.
--
-- Run with:  psql "$DATABASE_URL" -f migrations/20260615_fix_clinic_plan_enum.sql
-- ============================================================================

BEGIN;

DO $migrate$
DECLARE
  type_name text := 'enum_clinics_plan';  -- Sequelize names it enum_<table>_<column>
BEGIN
  -- Fresh DB: nothing to migrate, sync will create the right ENUM.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = type_name) THEN
    RAISE NOTICE 'Type % does not exist — fresh DB, nothing to migrate.', type_name;
    RETURN;
  END IF;

  -- Already migrated: 'free' present AND old 'growth' gone.
  IF EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = type_name AND e.enumlabel = 'free'
     )
     AND NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = type_name AND e.enumlabel = 'growth'
     ) THEN
    RAISE NOTICE 'Type % already migrated — nothing to do.', type_name;
    RETURN;
  END IF;

  -- 1. Move the old type aside.
  EXECUTE 'ALTER TYPE enum_clinics_plan RENAME TO enum_clinics_plan_old';

  -- 2. Create the new type with the correct values.
  EXECUTE $ddl$CREATE TYPE enum_clinics_plan AS ENUM ('free', 'starter', 'premium')$ddl$;

  -- 3. Drop the column default (it still points at the old type).
  EXECUTE 'ALTER TABLE clinics ALTER COLUMN plan DROP DEFAULT';

  -- 4. Convert the column to the new type, remapping existing values.
  --    Mapping rationale:
  --      'starter' -> 'free'    : old default; registration never set a plan,
  --                               so these clinics never actually subscribed.
  --      'growth'  -> 'starter' : closest paid tier in the new scheme.
  --      'agency'  -> 'premium' : top tier in the new scheme.
  --    >>> If you instead want to KEEP existing 'starter' rows as paid 'starter',
  --        change the first WHEN line below to:  WHEN 'starter' THEN 'starter'
  EXECUTE $convert$
    ALTER TABLE clinics
      ALTER COLUMN plan TYPE enum_clinics_plan
      USING (
        CASE plan::text
          WHEN 'starter' THEN 'free'
          WHEN 'growth'  THEN 'starter'
          WHEN 'agency'  THEN 'premium'
          ELSE 'free'
        END::enum_clinics_plan
      )
  $convert$;

  -- 5. Set the new default.
  EXECUTE 'ALTER TABLE clinics ALTER COLUMN plan SET DEFAULT ''free''';

  -- 6. Drop the old type.
  EXECUTE 'DROP TYPE enum_clinics_plan_old';

  RAISE NOTICE 'Migrated % to (free, starter, premium) with default free.', type_name;
END
$migrate$;

COMMIT;

-- ============================================================================
-- ROLLBACK (best effort — LOSSY).
-- The forward migration collapses three old values into the new scheme, so the
-- exact original plan of each row cannot be recovered. This restores the old
-- ENUM shape and maps new -> old approximately. Only use if you must revert.
-- ============================================================================
-- BEGIN;
-- ALTER TYPE enum_clinics_plan RENAME TO enum_clinics_plan_new;
-- CREATE TYPE enum_clinics_plan AS ENUM ('starter', 'growth', 'agency');
-- ALTER TABLE clinics ALTER COLUMN plan DROP DEFAULT;
-- ALTER TABLE clinics
--   ALTER COLUMN plan TYPE enum_clinics_plan
--   USING (
--     CASE plan::text
--       WHEN 'free'    THEN 'starter'
--       WHEN 'starter' THEN 'growth'
--       WHEN 'premium' THEN 'agency'
--       ELSE 'starter'
--     END::enum_clinics_plan
--   );
-- ALTER TABLE clinics ALTER COLUMN plan SET DEFAULT 'starter';
-- DROP TYPE enum_clinics_plan_new;
-- COMMIT;