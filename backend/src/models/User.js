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
    role: {
      type:         DataTypes.ENUM("admin", "user"),
      defaultValue: "admin", // clinic owners are admins
    },
    refreshToken: {
      type:      DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    isActive: {
      type:         DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "users",
    // Never return password or refreshToken in queries
    defaultScope: {
      attributes: { exclude: ["password", "refreshToken"] },
    },
    scopes: {
      // Use User.scope("withPassword") when you need the password (login)
      withPassword: {
        attributes: { include: ["password"] },
      },
      withRefreshToken: {
        attributes: { include: ["refreshToken"] },
      },
    },
  }
);

export default User;