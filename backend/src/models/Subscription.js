import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * Subscription
 * One row per clinic. Source of truth for billing state and metered usage.
 *
 * IMPORTANT — this table is owned by MIGRATIONS, not by sequelize.sync().
 * It is created by migrations/0001_subscriptions_and_webhook_events.sql and is
 * deliberately excluded from the sync list in src/db/bootstrap.js. If you add a
 * column here you MUST also write a migration for it.
 *
 * Why plan_type / subscription_status are STRING and not DataTypes.ENUM:
 * the underlying Postgres types are named `plan_type_enum` and
 * `subscription_status_enum` (created by the migration). Sequelize's ENUM
 * generates its own `enum_subscriptions_plan_type` type name and cannot bind to
 * a pre-existing named type, so modelling them as ENUM here would make sync()
 * and the migration fight each other. The database still enforces the
 * constraint; the `isIn` validators below just give us a friendly error
 * earlier, in JS.
 *
 * Writes: almost exclusively from the Paddle webhook handler
 * (controllers/billing.controller.js). Application code should treat this row
 * as read-only apart from the credit counters.
 */

export const SUBSCRIPTION_PLAN_TYPES = ["free", "starter", "premium"];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "paused",
  "incomplete",
];

const Subscription = sequelize.define(
  "Subscription",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // Foreign key to Clinic — association defined in models/index.js.
    // UNIQUE: one subscription per clinic, enforced at the DB level.
    clinicId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },

    planType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "free",
      validate: {
        isIn: {
          args: [SUBSCRIPTION_PLAN_TYPES],
          msg: `planType must be one of: ${SUBSCRIPTION_PLAN_TYPES.join(", ")}`,
        },
      },
    },

    subscriptionStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "active",
      validate: {
        isIn: {
          args: [SUBSCRIPTION_STATUSES],
          msg: `subscriptionStatus must be one of: ${SUBSCRIPTION_STATUSES.join(", ")}`,
        },
      },
    },

    // ── Paddle identifiers ──────────────────────────────────────────────────
    gatewayCustomerId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gatewaySubscriptionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    gatewayPriceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    // ── Billing period ──────────────────────────────────────────────────────
    currentPeriodStart: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    currentPeriodEnd: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    canceledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // ── Metered usage (reset when current_period_start rolls forward) ───────
    // Never write these directly — go through services/credits/credits.service.js
    // so the reserve stays atomic.
    smsCreditsUsed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    whatsappCreditsUsed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    creditsResetAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "subscriptions",
    // The migration installs a trg_subscriptions_set_updated_at trigger that
    // also maintains updated_at. Sequelize writing the same value is harmless.
    timestamps: true,
  }
);

export default Subscription;