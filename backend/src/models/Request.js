import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

const Request = sequelize.define(
  "Request",
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
    patientName: {
      type:      DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Patient name is required" },
      },
    },
    phone: {
      type:      DataTypes.STRING(20),
      allowNull: true,
    },
    email: {
      type:      DataTypes.STRING(150),
      allowNull: true,
      validate: {
        isEmail: { msg: "Must be a valid email address" },
      },
    },
    sendVia: {
      type:      DataTypes.ENUM("SMS", "Email", "Both"),
      allowNull: false,
    },
    status: {
      type:         DataTypes.ENUM("Sent", "Opened", "Reviewed", "Failed"),
      defaultValue: "Sent",
    },
    sentAt: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    // Message that was sent to patient
    messageBody: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "requests",
    indexes: [
      { fields: ["clinic_id"] },
      { fields: ["status"] },
    ],
  }
);

export default Request;