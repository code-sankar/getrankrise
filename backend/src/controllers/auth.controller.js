import { User, Clinic }        from "../models/index.js";
import { hashPassword, comparePassword } from "../utils/hash.js";
import {
  generateTokenPair,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "../utils/jwt.js";
import {
  successResponse,
  createdResponse,
  unauthorisedResponse,
  conflictResponse,
  badRequestResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";

// ── POST /api/v1/auth/register ────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { name, email, password, clinicName } = req.body;

    // 1. Check email not already registered
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return conflictResponse(res, "An account with this email already exists");
    }

    // 2. Hash password
    const hashedPassword = await hashPassword(password);

    // 3. Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role:     "admin",
    });

    // 4. Create clinic profile for this user
    await Clinic.create({
      userId:    user.id,
      clinicName,
    });

    // 5. Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user);

    // 6. Save refresh token to database
    await User.update(
      { refreshToken },
      { where: { id: user.id } }
    );

    // 7. Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    // 8. Return success with access token
    return createdResponse(res, {
      accessToken,
      user: {
        id:         user.id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        clinicName,
      },
    }, "Account created successfully");

  } catch (err) {
    console.error("register error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user including password (uses withPassword scope)
    const user = await User.scope("withPassword").findOne({ where: { email } });

    if (!user) {
      return unauthorisedResponse(res, "Invalid email or password");
    }

    if (!user.isActive) {
      return unauthorisedResponse(res, "Account has been deactivated");
    }

    // 2. Compare password
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return unauthorisedResponse(res, "Invalid email or password");
    }

    // 3. Get clinic name
    const clinic = await Clinic.findOne({ where: { userId: user.id } });

    // 4. Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user);

    // 5. Save refresh token to database
    await User.update(
      { refreshToken },
      { where: { id: user.id } }
    );

    // 6. Set refresh token cookie
    setRefreshTokenCookie(res, refreshToken);

    // 7. Return access token
    return successResponse(res, {
      message: "Login successful",
      data: {
        accessToken,
        user: {
          id:         user.id,
          name:       user.name,
          email:      user.email,
          role:       user.role,
          clinicName: clinic?.clinicName || null,
        },
      },
    });

  } catch (err) {
    console.error("login error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    // Clear refresh token from database
    await User.update(
      { refreshToken: null },
      { where: { id: req.user.id } }
    );

    // Clear cookie
    clearRefreshTokenCookie(res);

    return successResponse(res, { message: "Logged out successfully" });

  } catch (err) {
    console.error("logout error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/auth/refresh-token ──────────────────────────────────────────
// Called automatically by axios.helper.js when access token expires
export const refreshToken = async (req, res) => {
  try {
    // 1. Get refresh token from httpOnly cookie
    const token = req.cookies?.refreshToken;

    if (!token) {
      return unauthorisedResponse(res, "No refresh token");
    }

    // 2. Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return unauthorisedResponse(res, err.message);
    }

    // 3. Find user and check stored refresh token matches
    const user = await User.scope("withRefreshToken").findOne({
      where: { id: decoded.id },
    });

    if (!user || user.refreshToken !== token) {
      return unauthorisedResponse(res, "Invalid refresh token");
    }

    // 4. Generate new token pair
    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);

    // 5. Update stored refresh token
    await User.update(
      { refreshToken: newRefreshToken },
      { where: { id: user.id } }
    );

    // 6. Set new cookie
    setRefreshTokenCookie(res, newRefreshToken);

    // 7. Return new access token
    return successResponse(res, {
      message: "Token refreshed",
      data: { accessToken },
    });

  } catch (err) {
    console.error("refreshToken error:", err);
    return serverErrorResponse(res);
  }
};

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────
// Returns current logged in user + clinic
export const getMe = async (req, res) => {
  try {
    const clinic = await Clinic.findOne({
      where: { userId: req.user.id },
    });

    return successResponse(res, {
      message: "User fetched",
      data: {
        user: {
          id:    req.user.id,
          name:  req.user.name,
          email: req.user.email,
          role:  req.user.role,
        },
        clinic: clinic || null,
      },
    });

  } catch (err) {
    console.error("getMe error:", err);
    return serverErrorResponse(res);
  }
};

// ── PUT /api/v1/auth/change-password ─────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.scope("withPassword").findByPk(req.user.id);

    // Verify current password
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return badRequestResponse(res, "Current password is incorrect");
    }

    // Hash and save new password
    const hashed = await hashPassword(newPassword);
    await User.update({ password: hashed }, { where: { id: user.id } });

    return successResponse(res, { message: "Password updated successfully" });

  } catch (err) {
    console.error("changePassword error:", err);
    return serverErrorResponse(res);
  }
};