/**
 * reviews.hook.js — Phase 3 rewrite.
 *
 * THE BUG THIS FIXES (would have crashed the Dashboard on first real data):
 *
 *   Backend GET /reviews returns
 *       { success, message, data: { reviews: [...], total, limit, offset, cappedByPlan } }
 *
 *   The old hook did `dispatch(fetchReviewsSuccess(response.data.data))` —
 *   pushing the whole ENVELOPE OBJECT into state.list. The first component to
 *   call selectFilteredReviews would then run `.filter()` on an object and
 *   throw. Invisible today only because the fetch fails silently against an
 *   empty table and the (now deleted) mock list papered over it.
 *
 * This version unwraps the envelope, normalises each row through
 * normalizeReview() (backend field names → component field names), and
 * dispatches the typed payload fetchReviewsSuccess expects.
 */

import { toast } from "react-toastify";
import axiosInstance, { LONG_TIMEOUT } from "../utils/axios.helper.js";
import { getFriendlyError } from "../utils/parseErrorMsg.js";
import {
  addUserReviews,
  removeUserReviews,
  toggleUserReviewReplied,
  addSingleUserActivity,
} from "../store/userSlice.js";
import {
  fetchReviewsStart,
  fetchReviewsSuccess,
  fetchReviewsFailure,
  markReplied,
  normalizeReview,
} from "../store/reviewsSlice.js";

// ── Shared unwrap + normalise ────────────────────────────────────────────────
const toPayload = (envelope = {}) => ({
  reviews: (envelope.reviews ?? []).map(normalizeReview),
  total: envelope.total ?? envelope.reviews?.length ?? 0,
  cappedByPlan: Boolean(envelope.cappedByPlan),
});

// ── Fetch all reviews for the clinic ─────────────────────────────────────────
export const getUserReviews = async (dispatch, params = {}) => {
  dispatch(fetchReviewsStart());
  try {
    const response = await axiosInstance.get("/reviews", { params });
    const payload = toPayload(response?.data?.data);

    // Both slices get the SAME normalised rows so Dashboard and Profile agree.
    dispatch(addUserReviews(payload.reviews));
    dispatch(fetchReviewsSuccess(payload));
    return payload;
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    dispatch(fetchReviewsFailure(msg || "Could not load reviews."));
    console.error("getUserReviews error:", error);
    // No toast here: the Dashboard renders the error state inline, and this
    // runs on every page mount — a toast on each navigation would be noise.
  }
};

// ── Fetch reviews filtered by platform (server-side) ─────────────────────────
export const getReviewsByPlatform = async (dispatch, platform) =>
  getUserReviews(dispatch, { platform });

// ── Clear reviews from store (e.g. on logout) ────────────────────────────────
export const clearUserReviews = (dispatch) => {
  dispatch(removeUserReviews());
};

// ── Post a reply to a review ─────────────────────────────────────────────────
export const replyToReview = async (dispatch, reviewId, replyText) => {
  try {
    const response = await axiosInstance.post(`/reviews/${reviewId}/reply`, {
      reply: replyText,
    });
    if (response?.data) {
      dispatch(toggleUserReviewReplied(reviewId));
      dispatch(markReplied(reviewId));
      dispatch(
        addSingleUserActivity({
          _id: Date.now().toString(),
          action: "Replied to a patient review",
          time: "Just now",
          icon: "💬",
          type: "success",
        })
      );
      toast.success("Reply posted successfully!");
      return response.data;
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("replyToReview error:", error);
    throw error;
  }
};

// ── Generate AI reply for a review ───────────────────────────────────────────
// PHASE 3 CONTRACT CHANGE: this now THROWS on failure instead of resolving
// undefined. Callers must catch; the hook has already toasted.
export const generateAIReply = async (reviewId, reviewText, tone = "professional") => {
  try {
    const response = await axiosInstance.post(`/reviews/${reviewId}/ai-reply`, {
      reviewText,
      tone,
    });
    const reply = response?.data?.data?.reply;
    if (!reply) {
      throw new Error("AI service returned an empty reply");
    }
    return reply;
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    // 403 UPGRADE_REQUIRED already opened the upgrade modal via the axios
    // interceptor — don't stack a toast on top of it.
    if (error.response?.status !== 403) {
      toast.error(msg || "Could not generate an AI reply. Please try again.");
    }
    console.error("generateAIReply error:", error);
    throw error;
  }
};

// ── Manual review sync ───────────────────────────────────────────────────────
// POST /reviews/sync. The controller reserves from the review_sync DAILY meter
// (Free 0 / Starter 6 / Premium 48) and refunds on provider failure, so a
// failed sync never costs budget.
//
// Toast policy matches generateAIReply: everything is toasted here EXCEPT 403,
// which the axios interceptor already turns into the upgrade modal. Stacking a
// toast on top of a modal is noise.
export const syncReviewsNow = async (dispatch) => {
  try {
    // Walks paginated provider APIs — routinely longer than the 10s default.
    const { data } = await axiosInstance.post("/reviews/sync", null, {
      timeout: LONG_TIMEOUT,
    });
    toast.success(data?.message || "Reviews synced.");
    return data?.data ?? null;
  } catch (error) {
    const code = error.response?.data?.code;
    const serverMsg = error.response?.data?.message;

    if (error.response?.status === 403) {
      // UPGRADE_REQUIRED / QUOTA_EXCEEDED — interceptor owns the UI.
    } else if (code === "NO_CONNECTION") {
      toast.info(serverMsg || "Connect a review platform in Settings first.");
    } else if (code === "GBP_NOT_APPROVED") {
      // Ambient, not a user error: the approval gate is Google's, not theirs.
      toast.info(serverMsg || "Google hasn't approved API access yet.");
    } else if (code === "GBP_AUTH" || code === "NOT_CONNECTED") {
      toast.error(serverMsg || "Reconnect your Google account in Settings.");
    } else {
      toast.error(getFriendlyError(serverMsg) || "Could not sync reviews.");
    }

    console.error("syncReviewsNow error:", error);
    throw error;
  }
};