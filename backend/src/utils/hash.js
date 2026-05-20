import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12; // higher = more secure but slower

// ── Hash a plain text password ────────────────────────────────────────────────
export const hashPassword = async (plainPassword) => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(plainPassword, salt);
};

// ── Compare plain password against stored hash ────────────────────────────────
// Returns true if they match, false otherwise
export const comparePassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};