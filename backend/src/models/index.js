/**
 * models/index.js
 * Imports all models and defines their relationships.
 * Import from here in controllers: import { User, Clinic } from "../models/index.js"
 */

import User         from "./User.js";
import Clinic       from "./Clinic.js";
import Review       from "./Review.js";
import Request      from "./Request.js";
import Notification from "./Notification.js";

// ── Associations ──────────────────────────────────────────────────────────────

// User → Clinic (one to one)
// One user account owns one clinic profile
User.hasOne(Clinic,  { foreignKey: "userId", as: "clinic",  onDelete: "CASCADE" });
Clinic.belongsTo(User, { foreignKey: "userId", as: "user" });

// Clinic → Reviews (one to many)
// One clinic has many reviews
Clinic.hasMany(Review,  { foreignKey: "clinicId", as: "reviews",  onDelete: "CASCADE" });
Review.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

// Clinic → Requests (one to many)
// One clinic sends many review requests
Clinic.hasMany(Request,  { foreignKey: "clinicId", as: "requests", onDelete: "CASCADE" });
Request.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

// User → Notifications (one to many)
// One user receives many notifications
User.hasMany(Notification,  { foreignKey: "userId", as: "notifications", onDelete: "CASCADE" });
Notification.belongsTo(User, { foreignKey: "userId", as: "user" });

// ── Export all models ─────────────────────────────────────────────────────────
export {
  User,
  Clinic,
  Review,
  Request,
  Notification,
};