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
    // Subscription plan
    plan: {
      type:         DataTypes.ENUM("starter", "growth", "agency"),
      defaultValue: "starter",
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