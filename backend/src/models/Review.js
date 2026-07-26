import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * Review — Phase 8 (reply publishing) revision.
 *
 * Changes vs the Phase 4 copy:
 *   + replyPublishedAt / replyPublishError (migration 0009). Set by
 *     replyPublish.service.js when a reply is pushed to Google via GBP v4
 *     updateReply. NULL published_at on a replied row means "local only /
 *     unknown" — the sticky-replied merge rule in reviewSync.service.js is
 *     what keeps such rows from being un-replied by the next sync until the
 *     publish eventually lands.
 *
 * Carried forward, still true:
 *   1. `sentiment` (0–100, same scale as CompetitorSnapshot). Migration 0005
 *      adds it on existing databases and backfills from the rating heuristic;
 *      on fresh databases sync() creates it directly and 0005's ADD COLUMN
 *      IF NOT EXISTS no-ops. Write path: ingestion calls computeSentiment()
 *      per row. Read path: analytics COALESCEs NULLs through the identical
 *      SQL heuristic.
 *   2. The partial unique dedupe index is NOT declared here — it lives in
 *      migrations/0003_reviews_external_id_unique_index.sql as explicit SQL
 *      (uniq_reviews_clinic_platform_external). The old declaration reached
 *      for Sequelize internals via Symbol.for("ne"); an index that important
 *      doesn't get to depend on undocumented behaviour. Do not re-add it here.
 */
const Review = sequelize.define(
  "Review",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Foreign key to Clinic
    clinicId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    platform: {
      type: DataTypes.ENUM("Google", "Yelp", "Facebook"),
      allowNull: false,
    },
    reviewerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: "Anonymous",
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: { args: [1], msg: "Rating must be at least 1" },
        max: { args: [5], msg: "Rating cannot exceed 5" },
      },
    },
    reviewText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    replied: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    replyText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    repliedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // ── Reply publishing (migration 0009) ───────────────────────────────────
    // Written ONLY by the replyToReview controller path via
    // replyPublish.service.js. NULL replyPublishedAt on a replied row =
    // reply exists locally but its Google state is pending/unknown.
    replyPublishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    replyPublishError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // External review ID from Google/Yelp/Facebook. Deduplication is enforced
    // by uniq_reviews_clinic_platform_external in migration 0003.
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reviewDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // 0–100 sentiment score. v1 = rating heuristic (utils/sentiment.js);
    // NULL is legal and falls back to the same heuristic at read time, so a
    // future AI-scored upgrade is a backfill, not a migration.
    sentiment: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      validate: {
        min: { args: [0], msg: "Sentiment cannot be below 0" },
        max: { args: [100], msg: "Sentiment cannot exceed 100" },
      },
    },
  },
  {
    tableName: "reviews",
    indexes: [
      // Fast lookup by clinic
      { fields: ["clinic_id"] },
      // Fast lookup by platform
      { fields: ["platform"] },
      // Fast lookup by rating (for urgent reviews filter)
      { fields: ["rating"] },
      // NOTE: the unique (clinic_id, platform, external_id) partial index is
      // deliberately NOT declared here — see migration 0003.
    ],
  }
);

export default Review;