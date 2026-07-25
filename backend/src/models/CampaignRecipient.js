import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * CampaignRecipient — one row per (campaign, phone). THE WORK QUEUE.
 *
 * OWNED BY MIGRATIONS (0007). The runner claims pending rows with
 * FOR UPDATE SKIP LOCKED (raw SQL in campaignRunner.service.js — the ORM has
 * no clean expression for locked-claim batches, and this is exactly the case
 * where raw SQL is the better code). Status transitions:
 *
 *   pending → processing → sent | failed
 *           ↘ skipped_opt_out | skipped_invalid | skipped_no_credits
 *
 * Rows never move backwards except processing→pending via the crash-recovery
 * sweep (claimed_at older than 10 min).
 */

export const RECIPIENT_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "skipped_opt_out",
  "skipped_invalid",
  "skipped_no_credits",
];

const CampaignRecipient = sequelize.define(
  "CampaignRecipient",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    campaignId: { type: DataTypes.UUID, allowNull: false },
    clinicId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    status: {
      type: DataTypes.STRING(25),
      allowNull: false,
      defaultValue: "pending",
      validate: { isIn: { args: [RECIPIENT_STATUSES] } },
    },
    error: { type: DataTypes.TEXT, allowNull: true },
    providerId: { type: DataTypes.STRING(255), allowNull: true },
    claimedAt: { type: DataTypes.DATE, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "campaign_recipients",
    timestamps: true,
    updatedAt: false, // table has created_at only
  }
);

export default CampaignRecipient;