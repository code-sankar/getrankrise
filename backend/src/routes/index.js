/**
 * models/index.js — Phase 6 revision (supersedes Phase 1 copy).
 *
 * Adds Campaign, CampaignRecipient, OptOut. Table ownership unchanged:
 *   CORE (sequelize.sync)  User, Clinic, Review, Request, Notification,
 *                          Competitor, CompetitorSnapshot
 *   MIGRATED (SQL files)   Subscription, WebhookEvent, PlatformConnection,
 *                          Campaign, CampaignRecipient, OptOut
 * Never add a MIGRATED model to CORE_MODELS in src/db/bootstrap.js.
 */

import User from "./User.js";
import Clinic from "./Clinic.js";
import Review from "./Review.js";
import Request from "./Request.js";
import Notification from "./Notification.js";
import Competitor from "./Competitor.js";
import CompetitorSnapshot from "./CompetitorSnapshot.js";
import Subscription from "./Subscription.js";
import WebhookEvent from "./WebhookEvent.js";
import PlatformConnection from "./PlatformConnection.js";
import Campaign from "./Campaign.js";
import CampaignRecipient from "./CampaignRecipient.js";
import OptOut from "./OptOut.js";

// ── Associations ──────────────────────────────────────────────────────────────

User.hasOne(Clinic, { foreignKey: "userId", as: "clinic", onDelete: "CASCADE" });
Clinic.belongsTo(User, { foreignKey: "userId", as: "user" });

Clinic.hasMany(Review, { foreignKey: "clinicId", as: "reviews", onDelete: "CASCADE" });
Review.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

Clinic.hasMany(Request, { foreignKey: "clinicId", as: "requests", onDelete: "CASCADE" });
Request.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

User.hasMany(Notification, { foreignKey: "userId", as: "notifications", onDelete: "CASCADE" });
Notification.belongsTo(User, { foreignKey: "userId", as: "user" });

Clinic.hasMany(Competitor, { foreignKey: "clinicId", as: "competitors", onDelete: "CASCADE" });
Competitor.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

Competitor.hasMany(CompetitorSnapshot, {
  foreignKey: "competitorId",
  as: "snapshots",
  onDelete: "CASCADE",
});
CompetitorSnapshot.belongsTo(Competitor, { foreignKey: "competitorId", as: "competitor" });

Clinic.hasOne(Subscription, { foreignKey: "clinicId", as: "subscription", onDelete: "CASCADE" });
Subscription.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

Clinic.hasMany(PlatformConnection, {
  foreignKey: "clinicId",
  as: "platformConnections",
  onDelete: "CASCADE",
});
PlatformConnection.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

// ── Phase 6: campaigns ────────────────────────────────────────────────────────
Clinic.hasMany(Campaign, { foreignKey: "clinicId", as: "campaigns", onDelete: "CASCADE" });
Campaign.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinic" });

Campaign.hasMany(CampaignRecipient, {
  foreignKey: "campaignId",
  as: "recipients",
  onDelete: "CASCADE",
});
CampaignRecipient.belongsTo(Campaign, { foreignKey: "campaignId", as: "campaign" });

// OptOut: clinicId is NULLABLE (global rows), so no required association —
// query through the service helpers, which handle the global-or-clinic logic.

// ── Export all models ─────────────────────────────────────────────────────────
export {
  User,
  Clinic,
  Review,
  Request,
  Notification,
  Competitor,
  CompetitorSnapshot,
  Subscription,
  WebhookEvent,
  PlatformConnection,
  Campaign,
  CampaignRecipient,
  OptOut,
};