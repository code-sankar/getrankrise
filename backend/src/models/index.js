/**
 * backend/src/models/index.js — Phase 7 revision.
 *
 * WHAT CHANGED AND WHY (read before editing):
 * The Phase 6 revision of this file was written to the wrong path — it landed
 * at src/routes/index.js and this file was left at its Phase 1 content. The
 * consequence was silent and total: campaign.controller.js and
 * campaign.service.js both do
 *
 *     import { Campaign, CampaignRecipient, OptOut } from "../models/index.js";
 *
 * and got `undefined` for all three, because Phase 1 never imported them. Every
 * Pulse Campaigns endpoint threw on first property access, and the
 * Campaign→CampaignRecipient association never registered, so
 * `include: "recipients"` in the campaign detail query could never work.
 *
 * The stranded copy at src/routes/index.js is DELETED alongside this commit.
 * Its relative imports ("./Campaign.js") resolved against src/routes/, where no
 * model files exist, so it could never have worked in place either. Nothing
 * imported it — app.js names every router file explicitly — which is the only
 * reason the server still booted.
 *
 * ── TABLE OWNERSHIP (unchanged, and load-bearing) ────────────────────────────
 *   CORE (sequelize.sync)  User, Clinic, Review, Request, Notification,
 *                          Competitor, CompetitorSnapshot
 *   MIGRATED (SQL files)   Subscription, WebhookEvent, PlatformConnection,
 *                          Campaign, CampaignRecipient, OptOut
 *
 * Never add a MIGRATED model to CORE_MODELS in src/db/bootstrap.js. Defining a
 * model here does NOT create its table; it only teaches Sequelize how to read
 * one that migrations already own. Adding Campaign to CORE_MODELS would have
 * sync() race migration 0007 for ownership of the campaigns table, with
 * Sequelize generating its own enum type names — the exact failure class
 * Phase 0 exists to prevent.
 *
 * This file is imported for its SIDE EFFECTS as well as its exports:
 * src/db/bootstrap.js does a bare `import "../models/index.js"` so the
 * association calls below execute before any query runs.
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

// Clinic → PlatformConnections (one per platform, DB-enforced by
// uniq_platform_connection). hasMany rather than hasOne-per-platform so
// `include: "platformConnections"` returns all of them in one query for the
// Settings → Integrations tab.
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

// NOTE on campaign_recipients.clinic_id: migration 0007 denormalises the clinic
// onto every recipient row so opt-out checks and per-clinic reporting don't
// have to join through campaigns. It is deliberately NOT modelled as an
// association here — the runner and the reporting queries reach it via raw SQL,
// and adding Clinic.hasMany(CampaignRecipient) would give Sequelize a second
// path to the same rows and invite ambiguous `include` trees. The FK and its
// ON DELETE CASCADE are enforced by Postgres either way.

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