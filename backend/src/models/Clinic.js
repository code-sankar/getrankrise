import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

const Clinic = sequelize.define(
  "Clinic",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    // Foreign key to User — set in associations (index.js)
    userId: {
      type:      DataTypes.UUID,
      allowNull: false,
    },
    clinicName: {
      type:      DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Clinic name is required" },
      },
    },
    ownerName: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    phone: {
      type:      DataTypes.STRING(20),
      allowNull: true,
    },
    alertEmail: {
      type:      DataTypes.STRING(150),
      allowNull: true,
      validate: {
        isEmail: { msg: "Alert email must be a valid email" },
      },
    },
    location: {
      type:      DataTypes.STRING(200),
      allowNull: true,
    },
    // 2-letter ISO country code (e.g. "IN", "US"). Drives SMS/WhatsApp provider
    // routing in services/sms/index.js — "IN" routes via MSG91, otherwise Twilio.
    // clinic.controller.js already whitelists this field for updates; the column
    // was previously missing from the model, so values were silently dropped.
    countryCode: {
      type:      DataTypes.STRING(2),
      allowNull: true,
      set(value) {
        // Normalise to uppercase so routing comparisons are consistent
        this.setDataValue("countryCode", value ? String(value).toUpperCase() : value);
      },
    },
    googleBusinessUrl: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    googleReviewLink: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    // Notification preferences stored as JSON
    notificationPrefs: {
      type:         DataTypes.JSONB,
      defaultValue: {
        urgentAlerts:  true,
        newReviewAlert: true,
        weeklyReport:  false,
        monthlyReport: true,
      },
    },
    // Subscription plan — MUST stay in sync with config/plans.js (PLANS).
    // New clinics start on the free tier; upgrades happen via the subscription
    // endpoint. Changing these values requires a DB migration (the ENUM type
    // already exists in Postgres) — see migrations/20260615_fix_clinic_plan_enum.sql
    plan: {
      type:         DataTypes.ENUM("free", "starter", "premium"),
      defaultValue: "free",
    },
    isActive: {
      type:         DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "clinics",
  }
);

export default Clinic;