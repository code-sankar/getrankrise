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
    // ── Only a TOKEN problem is a 401 ────────────────────────────────────────
    // This catch was written for verifyAccessToken, which throws an Error whose
    // message is the JWT library's error NAME ("TokenExpiredError" /
    // "JsonWebTokenError") — the frontend interceptor matches on exactly that
    // string to decide whether to refresh. But the try block also contains the
    // `User.findByPk` on line 21, so it was swallowing every database failure
    // as well and answering with `unauthorisedResponse(res, err.message)`.
    //
    // Found by stopping Postgres under a live request. The response was:
    //
    //   401 {"success":false,"message":"connect ECONNREFUSED 127.0.0.1:5432"}
    //
    // Three things wrong with that, in increasing order of severity:
    //
    //   1. It discloses the database host and port to any caller.
    //   2. It never reaches errorHandler, so the outage is never reported and
    //      the response carries no eventId. A database being down — the single
    //      most important thing to be paged about — was invisible to monitoring.
    //   3. Worst: a 401 tells the client the SESSION is bad. The axios
    //      interceptor clears the token and redirects to /login on a
    //      non-expiry 401, so a brief database blip signs out every active
    //      user and makes them log back in. A 500 says "we are broken, try
    //      again", which is both true and recoverable.
    //
    // JWT_ERRORS is an allow-list rather than a check for "is this a database
    // error", because the safe default for an unrecognised failure is 500.
    const JWT_ERRORS = new Set([
      "TokenExpiredError",
      "JsonWebTokenError",
      "NotBeforeError",
    ]);

    if (JWT_ERRORS.has(err.message) || JWT_ERRORS.has(err.name)) {
      return unauthorisedResponse(res, err.message);
    }

    // Anything else is infrastructure. Hand it to errorHandler, which scrubs
    // the message, reports it with the request context, and returns a 500.
    return next(err);
  }
};