// backend/src/routes/member.routes.js
//
// Team management. Mounted at /api/v1/clinic/members in app.js.
//
// ── Where the owner boundary sits ───────────────────────────────────────────
// Reading the team is open to any member; every mutation is restrictTo("owner").
//
// That is not arbitrary. The owner/staff split exists to answer "can this
// person spend money or end the account", and the invite endpoint is strictly
// more powerful than either — anyone who can invite can invite themselves a
// second owner account and then do both. So the guard on this router is the
// same one on billing.routes.js, for the same reason.
//
// Listing deliberately stays open. A receptionist seeing who else has access is
// not a privilege leak, and hiding the team from the staff who work in it would
// make the app feel broken.
//
// ── The public preview route ────────────────────────────────────────────────
// GET /invitations/:token has no auth, by necessity: it is what the accept page
// calls to render "Join Bright Smiles Dental as a team member" before asking
// the invitee for anything, and that person may have no account at all. The
// token is the credential. POST /auth/accept-invite is public for the same
// reason and lives in auth.routes.js because it ends by issuing a session.
//
// Because one route must stay public, auth is applied PER ROUTE below rather
// than with a blanket router.use(protect, loadClinic).

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.middleware.js";
import { loadClinic, restrictTo } from "../middleware/loadClinic.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  validate,
  inviteMemberSchema,
  updateMemberRoleSchema,
  memberIdParamSchema,
  invitationIdParamSchema,
  invitationTokenParamSchema,
} from "../middleware/validate.middleware.js";
import {
  listMembers,
  inviteMember,
  revokeInvitation,
  removeMember,
  updateMemberRole,
  previewInvitation,
} from "../controllers/member.controller.js";

const router = Router();

// Inviting sends mail to an address the caller chooses. The owner guard already
// makes this a trusted caller, so this is a brake against a runaway script
// rather than an abuse control — generous enough to onboard a whole practice in
// one sitting.
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many invitations sent. Please try again in an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Unauthenticated, so it gets its own modest cap — the token space is 256 bits
// and unguessable, but an open endpoint should never be unbounded.
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public (see header before adding auth here) ─────────────────────────────
router.get(
  "/invitations/:token",
  previewLimiter,
  validate(invitationTokenParamSchema, "params"),
  asyncHandler(previewInvitation)
);

// ── Any member ──────────────────────────────────────────────────────────────
router.get("/", protect, loadClinic, asyncHandler(listMembers));

// ── Owner only ──────────────────────────────────────────────────────────────
router.post(
  "/invite",
  protect,
  loadClinic,
  restrictTo("owner"),
  inviteLimiter,
  validate(inviteMemberSchema),
  asyncHandler(inviteMember)
);

// Registered BEFORE /:userId so "invitations" is never captured as a user id.
router.delete(
  "/invitations/:id",
  protect,
  loadClinic,
  restrictTo("owner"),
  validate(invitationIdParamSchema, "params"),
  asyncHandler(revokeInvitation)
);

router.patch(
  "/:userId",
  protect,
  loadClinic,
  restrictTo("owner"),
  validate(memberIdParamSchema, "params"),
  validate(updateMemberRoleSchema),
  asyncHandler(updateMemberRole)
);

router.delete(
  "/:userId",
  protect,
  loadClinic,
  restrictTo("owner"),
  validate(memberIdParamSchema, "params"),
  asyncHandler(removeMember)
);

export default router;
