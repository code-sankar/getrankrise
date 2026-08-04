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
    // "WhatsApp" was missing here while validate.middleware.js accepted it and
    // request.controller.js reserved a WhatsApp credit and called the provider
    // for it. The message went out, then this insert threw 22P02 and the
    // handler refunded and returned a 500 — Premium's headline channel could
    // never complete a send. See migrations/0011 for the enum backfill.
    sendVia: {
      type:      DataTypes.ENUM("SMS", "Email", "Both", "WhatsApp"),
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
    // Optional client-supplied dedupe key. The uniqueness that actually
    // enforces it is the PARTIAL unique index in migrations/0011
    // (clinic_id, idempotency_key) WHERE idempotency_key IS NOT NULL — a
    // model-level `unique: true` would emit a plain unique index that treats
    // every NULL-keyed row as a candidate and cannot express the predicate.
    idempotencyKey: {
      type:      DataTypes.STRING(80),
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