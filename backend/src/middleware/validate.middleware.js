import Joi from "joi";
import { badRequestResponse } from "../utils/apiResponse.js";
import { VALID_PLANS } from "../config/plans.js";

// ── Common reusable bits ──────────────────────────────────────────────────────
const uuid     = Joi.string().uuid({ version: "uuidv4" });
const email    = Joi.string().email().lowercase().max(150);
const password = Joi.string().min(8).max(128);
const phone    = Joi.string().pattern(/^\+?[0-9\s()-]{7,20}$/).message("Phone must be a valid international number");

// Bare Joi.string().uri() accepts ANY scheme, so `javascript:alert(1)` and
// `data:text/html,...` validated and were stored. googleReviewLink in
// particular is interpolated into every SMS and email we send to a patient, so
// a non-web scheme there is at best a broken link in a real message.
// Restricting to http/https is what "this is a URL someone can visit" means.
const webUrl = Joi.string().uri({ scheme: ["http", "https"] }).max(2048)
  .messages({ "string.uriCustomScheme": "Must be a http:// or https:// link" });

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const registerSchema = Joi.object({
  name:       Joi.string().min(2).max(100).required(),
  email:      email.required(),
  password:   password.required()
    .messages({ "string.min": "Password must be at least 8 characters" }),
  clinicName: Joi.string().min(2).max(150).required(),
});

export const loginSchema = Joi.object({
  email:    email.required(),
  password: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     password.required(),
});

// ── ACCOUNT RECOVERY / VERIFICATION ───────────────────────────────────────────
// The emailed secret is 32 random bytes as base64url — 43 characters. The
// bounds below are a cheap sanity gate so a pathological string never reaches
// the SHA-256 or the database; they are NOT the security control, which is the
// single-use consumption in authToken.service.js.
const emailedToken = Joi.string().trim().min(20).max(512).required();

export const forgotPasswordSchema = Joi.object({
  email: email.required(),
});

export const resetPasswordSchema = Joi.object({
  token:       emailedToken,
  // Same rules as registration. A reset is not the moment to accept a weaker
  // password than signup would have.
  newPassword: password.required()
    .messages({ "string.min": "Password must be at least 8 characters" }),
});

export const verifyEmailSchema = Joi.object({
  token: emailedToken,
});

// ── TEAM INVITATIONS ──────────────────────────────────────────────────────────
export const inviteMemberSchema = Joi.object({
  email: email.required(),
  // Defaults to staff — granting ownership has to be typed, not defaulted into.
  role:  Joi.string().valid("owner", "staff").default("staff"),
});

export const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid("owner", "staff").required(),
});

// Accepting an invitation doubles as signup when the invited address has no
// account. name/password are therefore OPTIONAL here and required by the
// controller only on the create path — an existing user accepting an invite
// must not be asked to invent a new password for the account they already have.
export const acceptInviteSchema = Joi.object({
  token:    emailedToken,
  name:     Joi.string().min(2).max(100),
  password: password
    .messages({ "string.min": "Password must be at least 8 characters" }),
});

export const memberIdParamSchema = Joi.object({
  userId: uuid.required(),
});

export const invitationIdParamSchema = Joi.object({
  id: uuid.required(),
});

// The invitation token arrives as a PATH segment on the public preview route,
// so it is validated as a param rather than a body field.
export const invitationTokenParamSchema = Joi.object({
  token: emailedToken,
});

// ── CLINIC ────────────────────────────────────────────────────────────────────
export const updateClinicSchema = Joi.object({
  clinicName:        Joi.string().min(2).max(150),
  ownerName:         Joi.string().max(100).allow(""),
  phone:             phone.allow(""),
  alertEmail:        Joi.alternatives().try(email, Joi.string().allow("")),
  location:          Joi.string().max(200).allow(""),
  countryCode:       Joi.string().length(2).uppercase().allow("", null),
  googleBusinessUrl: webUrl.allow(""),
  googleReviewLink:  webUrl.allow(""),
}).min(1); // require at least one field

// ── SETTINGS (notification preferences) ───────────────────────────────────────
export const updateSettingsSchema = Joi.object({
  urgentAlerts:   Joi.boolean(),
  newReviewAlert: Joi.boolean(),
  weeklyReport:   Joi.boolean(),
  monthlyReport:  Joi.boolean(),
}).min(1);

export const toggleSettingSchema = Joi.object({
  key: Joi.string().valid("urgentAlerts", "newReviewAlert", "weeklyReport", "monthlyReport").required(),
});

// ── REVIEWS ───────────────────────────────────────────────────────────────────

// GET /api/v1/reviews query params.
//
// This endpoint went unvalidated while every other route was guarded, and it
// is the app's primary data read. Three separate params turned a client typo
// into a 500, all confirmed against live Postgres:
//
//   ?platform=DROP  → where.platform = "DROP", rejected by the reviews
//                     platform ENUM with 22P02 (invalid input value for enum)
//   ?rating=abc     → parseInt("abc") is NaN, which reaches the driver as an
//                     invalid integer
//   ?limit=-5       → the controller clamped the UPPER bound only
//                     (Math.min(limit, 100)), so -5 survived into LIMIT -5
//
// `platform` is spelled with the same capitalisation as the ENUM, because the
// controller passes the value through to the WHERE clause unchanged.
export const listReviewsQuerySchema = Joi.object({
  platform: Joi.string().valid("Google", "Yelp", "Facebook"),
  rating:   Joi.number().integer().min(1).max(5),
  status:   Joi.string().valid("replied", "unreplied"),
  limit:    Joi.number().integer().min(1).max(100).default(50),
  offset:   Joi.number().integer().min(0).default(0),
});

export const replyToReviewSchema = Joi.object({
  reply: Joi.string().min(1).max(5000).required(),
});

export const generateAiReplySchema = Joi.object({
  reviewText: Joi.string().min(1).max(5000).required(),
  tone:       Joi.string().valid("professional", "warm", "concise", "empathetic").default("professional"),
});

// ── REQUESTS (Pulse Campaigns) ────────────────────────────────────────────────
// The `.required()` on each `is:` schema is LOAD-BEARING, not decoration.
// A bare Joi.valid(...) also matches `undefined` — Joi treats "not present" as
// satisfying the condition unless presence is stated. So a body that omitted
// sendVia entirely matched BOTH branches, making phone AND email required, and
// the caller got three validation errors ("sendVia is required", "phone is
// required", "email is required") for one mistake. With `.required()` the
// condition only matches when sendVia is actually present and equal, so the
// `otherwise` branch handles the missing-sendVia case and the response names
// the single real problem.
export const sendRequestSchema = Joi.object({
  patientName: Joi.string().min(2).max(100).required(),
  sendVia:     Joi.string().valid("SMS", "Email", "Both", "WhatsApp").required(),
  phone:       Joi.when("sendVia", {
    is:        Joi.valid("SMS", "Both", "WhatsApp").required(),
    then:      phone.required(),
    otherwise: Joi.alternatives().try(phone, Joi.string().allow("", null)),
  }),
  email: Joi.when("sendVia", {
    is:        Joi.valid("Email", "Both").required(),
    then:      email.required(),
    otherwise: Joi.alternatives().try(email, Joi.string().allow("", null)),
  }),
  // Optional idempotency key — if same key sent twice within 24h, second request
  // returns the original result instead of double-charging SMS credits
  idempotencyKey: Joi.string().max(80).optional(),
});

// ── ADMIN/BILLING ─────────────────────────────────────────────────────────────
export const changePlanSchema = Joi.object({
  plan: Joi.string().valid(...VALID_PLANS).required(),
});

// ── Generic ID-in-params validator ────────────────────────────────────────────
export const idParamSchema = Joi.object({
  id: uuid.required(),
});

// ── Validation middleware factory ─────────────────────────────────────────────
// Usage: router.post("/register", validate(registerSchema), controller)

// Express 5 defines req.query as a prototype getter with no setter, so a plain
// `req.query = value` throws in strict mode (ES modules are always strict) and
// every validated GET route 500s. Shadow it with an own data property instead;
// body and params are ordinary writable properties and assign normally.
const assignValidated = (req, source, value) => {
  const descriptor = Object.getOwnPropertyDescriptor(req, source);
  if (descriptor && descriptor.writable) {
    req[source] = value;
    return;
  }
  Object.defineProperty(req, source, {
    value,
    writable:     true,
    enumerable:   true,
    configurable: true,
  });
};

export const validate = (schema, source = "body") => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly:    false,
    stripUnknown:  true,
    convert:       true,
  });

  if (error) {
    const errors = error.details.map((d) => ({ field: d.path.join("."), message: d.message }));
    return badRequestResponse(res, "Validation failed", errors);
  }

  // Re-assign so downstream gets the cleaned/casted version
  assignValidated(req, source, value);
  next();
};

// ── COMPETITORS ───────────────────────────────────────────────────────────────
export const addCompetitorSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(150).required(),
  platform:   Joi.string().valid("Google", "Yelp", "Facebook").default("Google"),
  externalId: Joi.string().trim().max(255).allow("", null),
  profileUrl: webUrl.allow("", null),
  location:   Joi.string().trim().max(200).allow("", null),
});

export const updateCompetitorSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(150),
  location:   Joi.string().trim().max(200).allow("", null),
  profileUrl: webUrl.allow("", null),
  isActive:   Joi.boolean(),
}).min(1); // at least one field