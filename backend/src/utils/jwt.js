import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// ── Generate access token (short-lived — 15 minutes) ─────────────────────────
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRY,
  });
};

// ── Generate refresh token (long-lived — 7 days) ─────────────────────────────
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
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

// ── Set refresh token as httpOnly cookie ──────────────────────────────────────
// httpOnly = JS cannot read it (XSS protection)
// secure   = only sent over HTTPS (in production)
// sameSite = CSRF protection
export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure:   env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

// ── Clear refresh token cookie ────────────────────────────────────────────────
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure:   env.NODE_ENV === "production",
    sameSite: "strict",
  });
};