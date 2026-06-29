import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * CompetitorSnapshot
 * One immutable row per sync of a tracked competitor. This is the historical
 * source of truth — the Competitor.latest* columns are just a cache of the
 * newest row here.
 *
 * Deltas (newReviews, ratingDelta) are computed at write time in
 * competitor.service.js against the previous snapshot, so trend/velocity
 * queries stay cheap (no window functions needed for the common case).
 */
const CompetitorSnapshot = sequelize.define(
  "CompetitorSnapshot",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    // Foreign key to Competitor — association defined in models/index.js
    competitorId: {
      type:      DataTypes.UUID,
      allowNull: false,
    },
    // Average star rating at capture time (e.g. 4.3)
    rating: {
      type:      DataTypes.FLOAT,
      allowNull: false,
      validate: {
        min: { args: [0], msg: "Rating cannot be negative" },
        max: { args: [5], msg: "Rating cannot exceed 5" },
      },
    },
    totalReviews: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    // Reviews gained since the previous snapshot (growth velocity)
    newReviews: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    // Change in average rating vs the previous snapshot (rating shift)
    ratingDelta: {
      type:         DataTypes.FLOAT,
      allowNull:    false,
      defaultValue: 0,
    },
    // % of reviews responded to (0–100)
    responseRate: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    // % positive sentiment (0–100)
    sentiment: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    capturedAt: {
      type:         DataTypes.DATE,
      allowNull:    false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "competitor_snapshots",
    // Snapshots are immutable — no updatedAt churn needed, but we keep
    // timestamps on for consistency with the rest of the schema.
    indexes: [
      { fields: ["competitor_id"] },
      // Powers "latest snapshot" and time-ranged trend queries
      { fields: ["competitor_id", "captured_at"] },
    ],
  }
);

export default CompetitorSnapshot;