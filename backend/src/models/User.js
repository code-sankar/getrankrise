import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

const User = sequelize.define(
  "User",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    name: {
      type:      DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Name is required" },
        len: { args: [2, 100], msg: "Name must be between 2 and 100 characters" },
      },
    },
    email: {
      type:      DataTypes.STRING(150),
      allowNull: false,
      unique:    true,
      validate: {
        isEmail: { msg: "Must be a valid email address" },
        notEmpty: { msg: "Email is required" },
      },
    },
    password: {
      type:      DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Password is required" },
      },
    },
    // PLATFORM-level role, not a clinic permission. It is carried in the JWT
    // and rendered as the badge in the UI, but NOTHING authorizes against it.
    //
    // Clinic permissions live in clinic_members.role (owner | staff) —
    // see migration 0015 and restrictTo() in loadClinic.middleware.js. Keep the
    // two straight: this column would be where an internal GetRankRise-staff
    // concept goes if one is ever needed; it says nothing about what a user may
    // do inside a clinic.
    role: {
      type:         DataTypes.ENUM("admin", "user"),
      defaultValue: "admin",
    },
    // NOTE: there is no refreshToken column here any more. Sessions live in the
    // `refresh_tokens` table (migrations/0014) — one row per device, each
    // individually revocable. A single column could only ever hold one session,
    // which meant a second login silently signed out the first device, and it
    // survived a password change untouched.
    isActive: {
      type:         DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "users",
    // Never return the password hash in queries
    defaultScope: {
      attributes: { exclude: ["password"] },
    },
    scopes: {
      // Use User.scope("withPassword") when you need the password (login)
      withPassword: {
        attributes: { include: ["password"] },
      },
    },
  }
);

export default User;