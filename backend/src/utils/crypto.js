// backend/src/utils/crypto.js
//
// Authenticated encryption for OAuth tokens at rest.
//
// AES-256-GCM, not CBC: GCM is authenticated, so a flipped bit anywhere in the
// ciphertext makes decryption THROW instead of silently returning garbage that
// then gets sent to Google as a bearer token.
//
// Wire format (all base64, one string, versioned so we can rotate algorithms):
//
//     "v1:" + base64( iv[12] || authTag[16] || ciphertext )
//
// KEY MANAGEMENT
//   TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate once:
//
//       node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
//   Losing this key means every stored refresh token is unrecoverable and all
//   clinics must reconnect Google. Treat it like the JWT secrets: environment
//   only, never committed, backed up in your secret manager.
//
//   Rotation: add TOKEN_ENCRYPTION_KEY_PREVIOUS, decrypt tries current then
//   previous, and a background job re-encrypts rows it decrypted with the old
//   key. The version prefix exists so that job can tell states apart.

import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // NIST-recommended nonce size for GCM
const TAG_BYTES = 16;
const VERSION = "v1";

function loadKey(hex, label) {
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `${label} must be exactly 64 hex characters (32 bytes). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return Buffer.from(hex, "hex");
}

const KEY = loadKey(env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
const KEY_PREVIOUS = loadKey(env.TOKEN_ENCRYPTION_KEY_PREVIOUS, "TOKEN_ENCRYPTION_KEY_PREVIOUS");

function requireKey() {
  if (!KEY) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. OAuth token storage is disabled until it is. " +
        "See src/utils/crypto.js for how to generate one."
    );
  }
}

/**
 * @param {string} plaintext
 * @returns {string} versioned, base64-encoded ciphertext safe to store in TEXT
 */
export function encryptToken(plaintext) {
  requireKey();
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext must be a non-empty string");
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

/**
 * @param {string} stored value previously produced by encryptToken()
 * @returns {string} plaintext
 * @throws on tampering, wrong key, or malformed input — callers should treat a
 *         throw as "connection needs re-auth", not retry.
 */
export function decryptToken(stored) {
  requireKey();
  if (typeof stored !== "string" || !stored.startsWith(`${VERSION}:`)) {
    throw new Error("decryptToken: unrecognised ciphertext format");
  }

  const raw = Buffer.from(stored.slice(VERSION.length + 1), "base64");
  if (raw.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("decryptToken: ciphertext too short");
  }

  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  const tryKey = (key) => {
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  };

  try {
    return tryKey(KEY);
  } catch (err) {
    if (KEY_PREVIOUS) {
      try {
        return tryKey(KEY_PREVIOUS);
      } catch {
        /* fall through to the original error */
      }
    }
    throw err;
  }
}

// ── Signed OAuth state ───────────────────────────────────────────────────────
//
// The Google callback arrives as a plain browser redirect — no Authorization
// header, no JWT, nothing identifying the user except what WE put in `state`.
// So state must (a) carry the clinic identity and (b) be tamper-proof, or
// anyone could complete an OAuth flow into someone else's clinic. It also
// serves its classic CSRF role: a callback whose state we didn't mint is
// rejected outright.
//
// Format: base64url(json) + "." + hmacSha256(base64url(json))
// Signed with ACCESS_TOKEN_SECRET — already required, already secret.

const stateSecret = () => env.ACCESS_TOKEN_SECRET;

/**
 * @param {object} payload e.g. { clinicId, userId }
 * @param {number} [ttlSeconds=600]
 */
export function signState(payload, ttlSeconds = 600) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds, n: crypto.randomBytes(8).toString("hex") })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * @param {string} state
 * @returns {object|null} the payload, or null if invalid/expired/tampered
 */
export function verifyState(state) {
  if (typeof state !== "string") return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}