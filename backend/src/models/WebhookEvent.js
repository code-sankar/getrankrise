import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * WebhookEvent
 * Append-only log of inbound gateway webhooks. Serves two purposes:
 *
 *   1. Idempotency — Paddle retries until it gets a 2xx, so the same event_id
 *      can arrive many times. The UNIQUE constraint on eventId is the guard:
 *      we INSERT first, and a conflict means "already processed, skip".
 *   2. Audit — the full payload is retained so billing disputes can be
 *      reconstructed without asking Paddle for history.
 *
 * IMPORTANT — owned by MIGRATIONS, not sequelize.sync(). Created in
 * migrations/0001_subscriptions_and_webhook_events.sql and excluded from the
 * sync list in src/db/bootstrap.js.
 */
const WebhookEvent = sequelize.define(
  "WebhookEvent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // 'paddle' today; kept generic so a second gateway doesn't need a new table.
    provider: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    // The gateway's own event identifier. UNIQUE — this is the idempotency key.
    eventId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },

    eventType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },

    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // NULL until processEvent() completes successfully. A row with a
    // receivedAt but no processedAt is a webhook that blew up mid-flight —
    // worth alerting on.
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "webhook_events",
    // The migration's table has no created_at/updated_at columns — receivedAt
    // serves that role. Turning timestamps off keeps the model honest.
    timestamps: false,
  }
);

export default WebhookEvent;