import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * PlatformConnection
 * One row per (clinic, platform) OAuth grant. Google today; Facebook later;
 * Yelp gets a row for uniformity even though it has no OAuth.
 *
 * OWNED BY MIGRATIONS — created by migrations/0004_platform_connections.sql,
 * excluded from the CORE_MODELS sync list in src/db/bootstrap.js. The enum
 * columns are modelled as STRING for the same reason Subscription's are: the
 * Postgres types (platform_enum, connection_status_enum) are created by the
 * migration under names Sequelize's ENUM cannot bind to.
 *
 * TOKEN HANDLING RULES — read before touching this model:
 *   1. Never read refreshTokenEnc/accessTokenEnc directly in a controller.
 *      Go through googleAuth.service.js getValidAccessToken(), which handles
 *      decryption, expiry, refresh, and failure states in one place.
 *   2. Never return a connection row to the client without going through
 *      toSafeJSON() below. defaultScope already excludes the token columns
 *      from queries, and toJSON strips them defensively as a second layer —
 *      but toSafeJSON() is the explicit, greppable contract.
 */

export const PLATFORMS = ["google", "yelp", "facebook"];
export const CONNECTION_STATUSES = ["pending_location", "connected", "error", "revoked"];

const TOKEN_FIELDS = ["refreshTokenEnc", "accessTokenEnc"];

const PlatformConnection = sequelize.define(
  "PlatformConnection",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clinicId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    platform: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: { args: [PLATFORMS], msg: `platform must be one of: ${PLATFORMS.join(", ")}` } },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending_location",
      validate: {
        isIn: { args: [CONNECTION_STATUSES], msg: `status must be one of: ${CONNECTION_STATUSES.join(", ")}` },
      },
    },

    // ── Encrypted OAuth material (see utils/crypto.js) ──────────────────────
    refreshTokenEnc: { type: DataTypes.TEXT, allowNull: true },
    accessTokenEnc: { type: DataTypes.TEXT, allowNull: true },
    accessTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    scopes: { type: DataTypes.TEXT, allowNull: true },

    // ── Remote identity ─────────────────────────────────────────────────────
    externalAccountId: { type: DataTypes.STRING(255), allowNull: true },
    externalAccountName: { type: DataTypes.STRING(255), allowNull: true },
    externalLocationId: { type: DataTypes.STRING(255), allowNull: true },
    externalLocationName: { type: DataTypes.STRING(255), allowNull: true },
    connectedEmail: { type: DataTypes.STRING(255), allowNull: true },

    // ── Bookkeeping ─────────────────────────────────────────────────────────
    connectedAt: { type: DataTypes.DATE, allowNull: true },
    lastRefreshedAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "platform_connections",
    timestamps: true,
    defaultScope: {
      // Token columns never leave the DB unless explicitly asked for.
      attributes: { exclude: TOKEN_FIELDS },
    },
    scopes: {
      // The ONLY sanctioned way to load tokens:
      //   PlatformConnection.scope("withTokens").findOne(...)
      // Grep for "withTokens" to audit every code path that touches secrets.
      withTokens: {
        attributes: { include: TOKEN_FIELDS },
      },
    },
  }
);

/**
 * Client-safe projection. Everything the frontend needs to render connection
 * state, nothing it must never see.
 */
PlatformConnection.prototype.toSafeJSON = function toSafeJSON() {
  return {
    id: this.id,
    platform: this.platform,
    status: this.status,
    accountName: this.externalAccountName,
    locationId: this.externalLocationId,
    locationName: this.externalLocationName,
    connectedEmail: this.connectedEmail,
    connectedAt: this.connectedAt,
    lastError: this.status === "error" ? this.lastError : null,
  };
};

// Defensive second layer: even if an instance was loaded withTokens and someone
// res.json()s it directly, the ciphertext still doesn't leave the process.
// (Leaking ciphertext isn't a key compromise, but it's surface area for free.)
const baseToJSON = PlatformConnection.prototype.toJSON;
PlatformConnection.prototype.toJSON = function toJSON() {
  const values = baseToJSON.call(this);
  for (const f of TOKEN_FIELDS) delete values[f];
  return values;
};

export default PlatformConnection;