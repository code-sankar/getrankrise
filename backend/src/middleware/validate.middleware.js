import Joi from "joi";
import { badRequestResponse } from "../utils/apiResponse.js";

// ── Validation schemas ────────────────────────────────────────────────────────

export const registerSchema = Joi.object({
  name:       Joi.string().min(2).max(100).required(),
  email:      Joi.string().email().required(),
  password:   Joi.string().min(8).required()
    .messages({ "string.min": "Password must be at least 8 characters" }),
  clinicName: Joi.string().min(2).max(150).required(),
});

export const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     Joi.string().min(8).required(),
});

export const updateClinicSchema = Joi.object({
  clinicName:        Joi.string().min(2).max(150),
  ownerName:         Joi.string().max(100),
  phone:             Joi.string().max(20),
  alertEmail:        Joi.string().email(),
  location:          Joi.string().max(200),
  googleBusinessUrl: Joi.string().uri().allow(""),
  googleReviewLink:  Joi.string().uri().allow(""),
  notificationPrefs: Joi.object({
    urgentAlerts:   Joi.boolean(),
    newReviewAlert: Joi.boolean(),
    weeklyReport:   Joi.boolean(),
    monthlyReport:  Joi.boolean(),
  }),
});

export const sendRequestSchema = Joi.object({
  patientName: Joi.string().min(2).max(100).required(),
  sendVia:     Joi.string().valid("SMS", "Email", "Both").required(),
  phone:       Joi.when("sendVia", {
    is:        Joi.valid("SMS", "Both"),
    then:      Joi.string().min(7).max(20).required(),
    otherwise: Joi.string().allow("", null),
  }),
  email: Joi.when("sendVia", {
    is:        Joi.valid("Email", "Both"),
    then:      Joi.string().email().required(),
    otherwise: Joi.string().allow("", null),
  }),
});

// ── Validation middleware factory ─────────────────────────────────────────────
// Usage: router.post("/register", validate(registerSchema), controller)
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((d) => d.message);
    return badRequestResponse(res, "Validation failed", errors);
  }

  next();
};