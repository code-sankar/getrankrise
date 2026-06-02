import { verifyAccessToken } from "../utils/jwt.js";
import { User } from "../models/index.js";
import { unauthorisedResponse } from "../utils/apiResponse.js";

// ── Protect route — verifies JWT access token ─────────────────────────────────
export const protect = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorisedResponse(res, "No token provided");
    }

    const token = authHeader.split(" ")[1];

    // 2. Verify the token — throws if expired or invalid
    const decoded = verifyAccessToken(token);

    // 3. Check user still exists in database
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return unauthorisedResponse(res, "User no longer exists");
    }

    if (!user.isActive) {
      return unauthorisedResponse(res, "Account has been deactivated");
    }

    // 4. Attach user to request object for use in controllers
    req.user = user;
    next();

  } catch (err) {
    // verifyAccessToken throws "TokenExpiredError" or "JsonWebTokenError"
    return unauthorisedResponse(res, err.message);
  }
};