import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * Competitor
 * A local rival business that a clinic is actively tracking.
 *
 * Source of truth for historical metrics lives in CompetitorSnapshot (one row
 * per sync). The `latest*` columns here are a denormalized cache of the most
 * recent snapshot so the list endpoint can render the whole table without a
 * join + sub-select per row. They are written only by competitor.service.js
 * after each successful sync — never trust the client to set them.
 */
const Competitor = sequelize.define(
  "Competitor",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    // Foreign key to Clinic — association defined in models/index.js
    clinicId: {
      type:      DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type:      DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Competitor name is required" },
        len: { args: [2, 150], msg: "Name must be between 2 and 150 characters" },
      },
    },
    // Primary platform we read this competitor's public metrics from
    platform: {
      type:         DataTypes.ENUM("Google", "Yelp", "Facebook"),
      allowNull:    false,
      defaultValue: "Google",
    },
    // External business identifier from the source (Google place_id, Yelp id…).
    // Used by the scraping provider and to dedupe within a clinic.
    externalId: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    profileUrl: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    location: {
      type:      DataTypes.STRING(200),
      allowNull: true,
    },
    // Soft on/off — pause tracking without losing snapshot history.
    // Counts against the plan's competitorLimit only while true.
    isActive: {
      type:         DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // ── Denormalized cache of the most recent snapshot ─────────────────────
    latestRating: {
      type:      DataTypes.FLOAT,
      allowNull: true,
    },
    latestTotalReviews: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    // % of reviews the competitor has publicly responded to (0–100)
    latestResponseRate: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    // % positive sentiment (0–100)
    latestSentiment: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    // New reviews since the previous snapshot — growth velocity at a glance
    newReviewsThisPeriod: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },

    // ── Sync bookkeeping ───────────────────────────────────────────────────
    lastSyncedAt: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    syncStatus: {
      type:         DataTypes.ENUM("pending", "ok", "failed"),
      defaultValue: "pending",
    },
    syncError: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "competitors",
    indexes: [
      // Fast lookup of a clinic's tracked rivals
      { fields: ["clinic_id"] },
      // Common filter: only active competitors
      { fields: ["clinic_id", "is_active"] },
      // Prevent the same external business being tracked twice by one clinic.
      // Partial index — only applies when externalId is set (mirrors Review).
      {
        unique: true,
        fields: ["clinic_id", "external_id", "platform"],
        where:  { external_id: { [Symbol.for("ne")]: null } },
      },
    ],
  }
);

export default Competitor;