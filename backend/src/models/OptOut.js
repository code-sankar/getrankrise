import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * OptOut — suppression list. OWNED BY MIGRATIONS (0007).
 *
 * clinicId NULL  = GLOBAL suppression. Inbound STOP arrives on the shared
 *                  Twilio number with no clinic attribution, so STOP
 *                  suppresses that phone across the whole platform — the
 *                  compliance-safe reading (a person who texted STOP did not
 *                  consent to hearing from a *different* clinic via us).
 * clinicId set   = one clinic's manual list.
 *
 * Uniqueness is enforced by two partial indexes in 0007 (Postgres treats
 * NULLs as distinct in plain unique constraints). Inserts should therefore
 * use ON CONFLICT DO NOTHING via the service helpers, not Model.create.
 */
const OptOut = sequelize.define(
  "OptOut",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clinicId: { type: DataTypes.UUID, allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    channel: { type: DataTypes.STRING(10), allowNull: true }, // NULL = all
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: { args: [["inbound_stop", "manual", "import"]] } },
    },
  },
  { tableName: "opt_outs", timestamps: true, updatedAt: false }
);

export default OptOut;