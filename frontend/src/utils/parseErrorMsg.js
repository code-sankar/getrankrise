/**
 * parseErrorMsg.js
 * Extracts a clean, human-readable error message from
 * any API error response shape our backend might return.
 *
 * Handles:
 *   { message: "..." }
 *   { error: "..." }
 *   { data: { message: "..." } }
 *   Plain string responses
 *   JWT specific errors (TokenExpiredError, JsonWebTokenError)
 */

export const parseErrorMessage = (responseData) => {
  if (!responseData) return "Something went wrong. Please try again.";

  // Plain string
  if (typeof responseData === "string") return responseData;

  // Standard shapes
  if (responseData.message) return responseData.message;
  if (responseData.error)   return responseData.error;

  // Nested data object
  if (responseData.data?.message) return responseData.data.message;

  return "Something went wrong. Please try again.";
};

/**
 * Maps known backend error codes to user-friendly messages.
 * Add more as your backend grows.
 */
export const getFriendlyError = (message) => {
  const map = {
    TokenExpiredError:    "Your session has expired. Please log in again.",
    JsonWebTokenError:    "Invalid session. Please log in again.",
    CLINIC_NOT_FOUND:     "Clinic not found. Please check your details.",
    INVALID_CREDENTIALS:  "Incorrect email or password.",
    EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
    REVIEW_NOT_FOUND:     "Review not found.",
    UNAUTHORIZED:         "You are not authorised to perform this action.",
    FORBIDDEN:            "Access denied.",
    NETWORK_ERROR:        "Network error. Please check your connection.",
  };

  return map[message] || message || "Something went wrong. Please try again.";
};