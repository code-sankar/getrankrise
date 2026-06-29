import Joi from "joi";
import { badRequestResponse } from "../utils/apiResponse.js";
import { VALID_PLANS } from "../config/plans.js";

// ── Common reusable bits ──────────────────────────────────────────────────────
const uuid     = Joi.string().uuid({ version: "uuidv4" });
const email    = Joi.string().email().lowercase().max(150);
const password = Joi.string().min(8).max(128);
const phone    = Joi.string().pattern(/^\+?[0-9\s()-]{7,20}$/).message("Phone must be a valid international number");

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

// ── CLINIC ────────────────────────────────────────────────────────────────────
export const updateClinicSchema = Joi.object({
  clinicName:        Joi.string().min(2).max(150),
  ownerName:         Joi.string().max(100).allow(""),
  phone:             phone.allow(""),
  alertEmail:        Joi.alternatives().try(email, Joi.string().allow("")),
  location:          Joi.string().max(200).allow(""),
  countryCode:       Joi.string().length(2).uppercase().allow("", null),
  googleBusinessUrl: Joi.string().uri().allow(""),
  googleReviewLink:  Joi.string().uri().allow(""),
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
export const replyToReviewSchema = Joi.object({
  reply: Joi.string().min(1).max(5000).required(),
});

export const generateAiReplySchema = Joi.object({
  reviewText: Joi.string().min(1).max(5000).required(),
  tone:       Joi.string().valid("professional", "warm", "concise", "empathetic").default("professional"),
});

// ── REQUESTS (Pulse Campaigns) ────────────────────────────────────────────────
export const sendRequestSchema = Joi.object({
  patientName: Joi.string().min(2).max(100).required(),
  sendVia:     Joi.string().valid("SMS", "Email", "Both", "WhatsApp").required(),
  phone:       Joi.when("sendVia", {
    is:        Joi.valid("SMS", "Both", "WhatsApp"),
    then:      phone.required(),
    otherwise: Joi.alternatives().try(phone, Joi.string().allow("", null)),
  }),
  email: Joi.when("sendVia", {
    is:        Joi.valid("Email", "Both"),
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
  req[source] = value;
  next();
};

// ── COMPETITORS ───────────────────────────────────────────────────────────────
export const addCompetitorSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(150).required(),
  platform:   Joi.string().valid("Google", "Yelp", "Facebook").default("Google"),
  externalId: Joi.string().trim().max(255).allow("", null),
  profileUrl: Joi.string().uri().max(2048).allow("", null),
  location:   Joi.string().trim().max(200).allow("", null),
});

export const updateCompetitorSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(150),
  location:   Joi.string().trim().max(200).allow("", null),
  profileUrl: Joi.string().uri().max(2048).allow("", null),
  isActive:   Joi.boolean(),
}).min(1); // at least one field