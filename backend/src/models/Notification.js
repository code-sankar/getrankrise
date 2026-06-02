import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    // Foreign key to User
    userId: {
      type:      DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type:      DataTypes.ENUM("urgent", "info", "success", "warning"),
      allowNull: false,
    },
    message: {
      type:      DataTypes.STRING(300),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Message is required" },
      },
    },
    read: {
      type:         DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Optional link to a related review
    reviewId: {
      type:      DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: "notifications",
    indexes: [
      { fields: ["user_id"] },
      // Fast lookup for unread count
      { fields: ["user_id", "read"] },
    ],
  }
);

export default Notification;