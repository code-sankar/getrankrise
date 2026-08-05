#!/usr/bin/env node
// backend/scripts/add-clinic-member.js
//
// Creates a staff (or owner) account inside an existing clinic.
//
// There is no invite UI yet. This script is what makes the owner/staff split a
// real, exercisable thing rather than an enum nobody can reach — and it is the
// operation an invite flow would eventually call.
//
// Usage:
//   node -r dotenv/config scripts/add-clinic-member.js \
//        --clinic-of <existing-member-email> \
//        --email <new-member-email> \
//        --name "Front Desk" \
//        --password <password> \
//        [--role staff|owner]
//
// ── Why this creates the user rather than adopting an existing one ──────────
// Registration always creates a clinic for the person registering, and
// clinic_members has a UNIQUE constraint on user_id because loadClinic resolves
// exactly one clinic per user (there is no clinic switcher). So an
// already-registered user cannot simply be added to a second clinic — they
// would have to be MOVED, orphaning the clinic they registered.
//
// Creating the account directly here avoids that entirely: a staff member is
// someone who was never meant to have their own clinic. Use --move to relocate
// an existing account anyway, which prints what it is about to orphan.

import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db.js";
import { initializeDatabase, closeDatabase } from "../src/db/bootstrap.js";
import { hashPassword } from "../src/utils/hash.js";

function parseArgs(argv) {
  const out = { role: "staff", move: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--move") { out.move = true; continue; }
    const key = { "--clinic-of": "clinicOf", "--email": "email", "--name": "name",
                  "--password": "password", "--role": "role" }[a];
    if (key) out[key] = argv[++i];
  }
  return out;
}

const usage = (msg) => {
  if (msg) console.error(`✖ ${msg}\n`);
  console.error(
    "Usage:\n" +
      "  node -r dotenv/config scripts/add-clinic-member.js \\\n" +
      "       --clinic-of <existing-member-email> \\\n" +
      "       --email <new-member-email> --name \"Front Desk\" --password <password> \\\n" +
      "       [--role staff|owner] [--move]\n"
  );
  process.exit(1);
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clinicOf || !args.email) usage("--clinic-of and --email are required");
  if (!["owner", "staff"].includes(args.role)) usage(`--role must be owner or staff, got "${args.role}"`);

  await initializeDatabase();

  const [clinic] = await sequelize.query(
    `SELECT c.id, c.clinic_name
       FROM clinic_members m
       JOIN users u   ON u.id = m.user_id
       JOIN clinics c ON c.id = m.clinic_id
      WHERE u.email = $1::text`,
    { bind: [args.clinicOf], type: QueryTypes.SELECT }
  );
  if (!clinic) usage(`No clinic reachable via ${args.clinicOf} — is that address a member of one?`);

  const [existing] = await sequelize.query(
    `SELECT u.id, u.name, c.id AS current_clinic_id, c.clinic_name AS current_clinic
       FROM users u
       LEFT JOIN clinic_members m ON m.user_id = u.id
       LEFT JOIN clinics c        ON c.id = m.clinic_id
      WHERE u.email = $1::text`,
    { bind: [args.email], type: QueryTypes.SELECT }
  );

  let userId;

  if (!existing) {
    if (!args.password || !args.name) {
      usage("--name and --password are required when creating a new member account");
    }
    const hashed = await hashPassword(args.password);
    const [created] = await sequelize.query(
      `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::text, $2::text, $3::text, 'admin', true, NOW(), NOW())
       RETURNING id`,
      { bind: [args.name, args.email, hashed], type: QueryTypes.SELECT }
    );
    userId = created.id;
    console.log(`   created account for ${args.email}`);
  } else {
    userId = existing.id;
    if (existing.current_clinic_id && existing.current_clinic_id !== clinic.id) {
      if (!args.move) {
        console.error(
          `✖ ${args.email} already belongs to "${existing.current_clinic}".\n` +
            `  A user can belong to exactly one clinic (see migration 0015).\n` +
            `  Re-run with --move to relocate them — note that "${existing.current_clinic}"\n` +
            `  will be left with no members and become unreachable.\n`
        );
        process.exit(1);
      }
      console.warn(`⚠  Moving ${args.email} out of "${existing.current_clinic}", which will be left unreachable.`);
    }
  }

  const [row] = await sequelize.query(
    `INSERT INTO clinic_members (clinic_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, $3::clinic_role_enum)
     ON CONFLICT ON CONSTRAINT uniq_member_user
     DO UPDATE SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role
     RETURNING role`,
    { bind: [clinic.id, userId, args.role], type: QueryTypes.SELECT }
  );

  console.log(`✅ ${args.email} is now "${row.role}" of ${clinic.clinic_name}`);
  await closeDatabase();
}

main().catch(async (err) => {
  console.error("✖ Failed:", err.message);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
