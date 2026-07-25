import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * Campaign — one Pulse Campaign (bulk review-request send).
 *
 * OWNED BY MIGRATIONS (0007) — never add to CORE_MODELS in db/bootstrap.js.
 * Status/channel are TEXT-with-validators, same convention as Subscription.
 *
 * The denormalised counters (sent_count etc.) are written ONLY by
 * campaignRunner.service.js after each batch. Controllers read them; nothing
 * else writes them.
 */

export const CAMPAIGN_CHANNELS = ["SMS", "WhatsApp"];
export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "canceled",
  "failed",
];

const Campaign = sequelize.define(
  "Campaign",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clinicId: { type: DataTypes.UUID, allowNull: false },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: { notEmpty: { msg: "Campaign name is required" } },
    },
    channel: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: { isIn: { args: [CAMPAIGN_CHANNELS], msg: "channel must be SMS or WhatsApp" } },
    },
    messageTemplate: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "draft",
      validate: { isIn: { args: [CAMPAIGN_STATUSES] } },
    },
    scheduledAt: { type: DataTypes.DATE, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    throttlePerMinute: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      validate: { min: 1, max: 60 },
    },
    totalRecipients: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skippedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastError: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "campaigns", timestamps: true }
);

export default Campaign;