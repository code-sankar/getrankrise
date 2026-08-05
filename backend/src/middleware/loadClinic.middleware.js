// backend/src/middleware/loadClinic.middleware.js
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { Clinic } from "../models/index.js";
import {
  notFoundResponse,
  unauthorisedResponse,
  forbiddenResponse,
} from "../utils/apiResponse.js";

// Must run AFTER protect — depends on req.user. Sets req.clinic, the tenant
// boundary every controller scopes its queries by, and req.clinicRole, which
// restrictTo() enforces against.
//
// ── Membership, not ownership ───────────────────────────────────────────────
// This resolved the tenant with `Clinic.findOne({ where: { userId } })`, which
// hardcoded one-user-per-clinic into the single line every authenticated route
// passes through. A second person on the same clinic was not merely
// unimplemented, it was unrepresentable. Resolution now goes through
// clinic_members (migration 0015), so a clinic can have an owner and staff.
//
// clinics.user_id is deliberately left alone — it stays the original-owner
// pointer that the registration transaction writes and that admin/reporting
// queries join on. Membership is the authorization record; user_id is
// provenance.
export const loadClinic = async (req, res, next) => {
  try {
    if (!req.user?.id) return unauthorisedResponse(res, "Not authenticated");

    const [membership] = await sequelize.query(
      `SELECT clinic_id, role FROM clinic_members WHERE user_id = $1::uuid LIMIT 1`,
      { bind: [req.user.id], type: QueryTypes.SELECT }
    );

    if (!membership) {
      return notFoundResponse(res, "No clinic found for this account");
    }

    const clinic = await Clinic.findByPk(membership.clinic_id);
    if (!clinic) {
      // A membership pointing at a deleted clinic. The FK has ON DELETE CASCADE
      // so this should be unreachable; treating it as "no clinic" rather than
      // crashing keeps a data anomaly from 500-ing every request the user makes.
      return notFoundResponse(res, "No clinic found for this account");
    }

    req.clinic = clinic;
    req.clinicRole = membership.role;
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Route guard: the caller's role in THIS clinic must be one of `roles`.
 *
 * Must run after loadClinic, which is what sets req.clinicRole.
 *
 *     router.post("/create-checkout", protect, loadClinic,
 *                 restrictTo("owner"), handler);
 *
 * The 403 names the required role rather than saying "Forbidden", because the
 * caller is a legitimate user of the app who simply is not the owner, and
 * "Access denied." gives them nothing to act on.
 */
export const restrictTo = (...roles) => (req, res, next) => {
  if (!req.clinicRole) {
    // Programmer error: restrictTo was mounted without loadClinic in front of
    // it. Fail closed and say so loudly rather than silently allowing.
    console.error(
      `restrictTo(${roles.join(",")}) reached with no req.clinicRole — is loadClinic mounted before it?`
    );
    return forbiddenResponse(res, "Permission could not be determined.");
  }

  if (!roles.includes(req.clinicRole)) {
    return res.status(403).json({
      success: false,
      code: "INSUFFICIENT_ROLE",
      message:
        roles.length === 1 && roles[0] === "owner"
          ? "Only the clinic owner can do this. Ask them to make the change."
          : `This action needs one of these roles: ${roles.join(", ")}.`,
      requiredRoles: roles,
      yourRole: req.clinicRole,
    });
  }

  return next();
};
