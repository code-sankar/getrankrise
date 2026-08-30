import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

// ── Generate access token (short-lived — 15 minutes) ─────────────────────────
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRY,
  });
};

// ── Generate refresh token (long-lived — 7 days) ─────────────────────────────
//
// The `jti` is load-bearing, not decoration. Without it the payload is just
// { id, email, role } and `iat` has ONE-SECOND resolution, so two calls for the
// same user inside the same second produce a BYTE-IDENTICAL token. That is not
// a theoretical window: logging in on two devices at once, or a login
// immediately followed by a refresh, lands there routinely.
//
// Two devices sharing one refresh token means revoking either revokes both, and
// the reuse detection in refreshToken.service.js would read the second device's
// perfectly legitimate refresh as a stolen-token replay and log the whole
// account out. The refresh_tokens.token_hash UNIQUE constraint surfaced this
// immediately — a duplicate-key error on the second login — which is exactly
// what that constraint is for.
export const generateRefreshToken = (payload) => {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRY,
  });
};

// ── Verify access token ───────────────────────────────────────────────────────
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET);
  } catch (err) {
    // Return the error name so the frontend interceptor
    // can detect "TokenExpiredError" and trigger a refresh
    throw new Error(err.name);
  }
};

// ── Verify refresh token ──────────────────────────────────────────────────────
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    throw new Error(err.name);
  }
};

// ── Expiry of an already-issued token ────────────────────────────────────────
// refresh_tokens.expires_at has to match the JWT's own `exp` exactly, or the
// table and the signature disagree about when a session ends. Reading the claim
// is precise; re-parsing REFRESH_TOKEN_EXPIRY ("7d") would be a second,
// drift-prone source of truth for the same number.
export const getTokenExpiry = (token) => {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) {
    throw new Error("Token has no exp claim — cannot record its expiry");
  }
  return new Date(decoded.exp * 1000);
};

// ── Generate both tokens at once ──────────────────────────────────────────────
// Called after login and register — returns both tokens
export const generateTokenPair = (user) => {
  // Only include non-sensitive data in the token payload
  const payload = {
    id:    user.id,
    email: user.email,
    role:  user.role,
  };
  return {
    accessToken:  generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

// ── Refresh-token cookie policy ───────────────────────────────────────────────
// httpOnly = JS cannot read it (XSS protection)
// secure   = only sent over HTTPS
// sameSite = CSRF protection, but ALSO the thing that decides whether the
//            cookie is sent at all on a split-domain deployment.
//
// This was hardcoded to "strict", which silently breaks the session on the
// most likely production topology for this app. The SPA ships to Vercel while
// the API runs somewhere else; if those are different registrable domains
// (kirtify.vercel.app vs an api host on another domain), a "strict" cookie
// is NEVER sent cross-site. POST /auth/refresh-token then 401s every time, and
// every user is hard-logged-out the moment their 15-minute access token
// expires — with nothing in the logs but routine 401s.
//
// "none" is what a cross-site cookie requires, and browsers only accept it
// alongside secure:true (HTTPS). So production defaults to none+secure, which
// is correct for both topologies: it also works when the app and API DO share
// a parent domain, just with weaker CSRF hardening than "lax"/"strict".
//
// If you deploy app + API under one registrable domain (kirtify.com and
// api.kirtify.com), set COOKIE_SAMESITE=lax to get that hardening back.
// CSRF risk is contained regardless: this cookie is only ever exchanged at
// /auth/refresh-token, every other endpoint authenticates from the
// Authorization header, and CORS is a strict CLIENT_URL allow-list.
const isProd = () => env.NODE_ENV === "production";

const sameSitePolicy = () => {
  const configured = (process.env.COOKIE_SAMESITE || "").toLowerCase();
  if (["strict", "lax", "none"].includes(configured)) return configured;
  // Dev runs over http://localhost, where "none" would be rejected for not
  // being secure — so dev gets "lax", which works same-site on localhost.
  return isProd() ? "none" : "lax";
};

const cookieOptions = () => {
  const sameSite = sameSitePolicy();
  return {
    httpOnly: true,
    // sameSite:"none" is invalid without secure — browsers drop the cookie
    // outright. Force the pairing rather than emitting a Set-Cookie that
    // silently does nothing.
    secure: isProd() || sameSite === "none",
    sameSite,
  };
};

export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

// ── Clear refresh token cookie ────────────────────────────────────────────────
// Attributes must match the ones it was set with, or the browser treats it as
// a different cookie and the logout leaves the original in place.
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie("refreshToken", cookieOptions());
};