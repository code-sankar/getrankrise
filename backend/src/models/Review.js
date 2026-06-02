import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

const Review = sequelize.define(
  "Review",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    // Foreign key to Clinic
    clinicId: {
      type:      DataTypes.UUID,
      allowNull: false,
    },
    platform: {
      type:      DataTypes.ENUM("Google", "Yelp", "Facebook"),
      allowNull: false,
    },
    reviewerName: {
      type:         DataTypes.STRING(100),
      allowNull:    true,
      defaultValue: "Anonymous",
    },
    rating: {
      type:      DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: { args: [1], msg: "Rating must be at least 1" },
        max: { args: [5], msg: "Rating cannot exceed 5" },
      },
    },
    reviewText: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    replied: {
      type:         DataTypes.BOOLEAN,
      defaultValue: false,
    },
    replyText: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    repliedAt: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    // External review ID from Google/Yelp/Facebook
    externalId: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    reviewDate: {
      type:      DataTypes.DATE,
      allowNull: true,
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
      // Prevent duplicate reviews from same platform
      {
        unique: true,
        fields: ["clinic_id", "external_id", "platform"],
        where: { external_id: { [Symbol.for("ne")]: null } },
      },
    ],
  }
);

export default Review;