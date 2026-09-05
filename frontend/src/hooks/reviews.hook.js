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
const toPayload = (envelope = {}, { append = false, offset = 0 } = {}) => ({
  reviews: (envelope.reviews ?? []).map(normalizeReview),
  total: envelope.total ?? envelope.reviews?.length ?? 0,
  cappedByPlan: Boolean(envelope.cappedByPlan),
  append,
  offset,
});

// One page. The server's own ceiling is 100 (listReviewsQuerySchema), so this
// asks for the largest page it will serve and pages from there.
export const REVIEWS_PAGE_SIZE = 100;

// ── Fetch reviews for the clinic ─────────────────────────────────────────────
//
// PAGINATION. This used to be called with no params at all, which took the
// server's default of 50 — and nothing in the UI ever read `total`, so a clinic
// with 136 stored reviews saw exactly 50, a badge reading "50 Reviews Found",
// and no control to load the rest. The dashboard stat pills are derived from
// whatever is in state.reviews.list, so they described that truncated slice
// while the Analytics page aggregated server-side over all 136 — two screens of
// the same app quoting different numbers with no way to tell which was right.
//
// `append` is what makes "Load more" additive rather than a page-replacing
// fetch; the first page (offset 0) always replaces, so filters and refreshes
// still reset cleanly.
export const getUserReviews = async (dispatch, params = {}) => {
  const { append = false, ...query } = params;
  const offset = query.offset ?? 0;

  dispatch(fetchReviewsStart());
  try {
    const response = await axiosInstance.get("/reviews", {
      params: { limit: REVIEWS_PAGE_SIZE, offset, ...query },
    });
    const payload = toPayload(response?.data?.data, { append, offset });

    // Both slices get the SAME normalised rows so Dashboard and Profile agree.
    //
    // addUserReviews is an unconditional append ([...state, ...payload]), so
    // the userSlice mirror has to be cleared whenever this is a REPLACING
    // fetch — otherwise every remount, every filter change and now every
    // "Load more" stacks another copy of the same rows onto it forever.
    // Nothing renders userReviews today, which is why the duplication has been
    // invisible; paging 100 at a time would have made it unbounded growth.
    if (!append) dispatch(removeUserReviews());
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

/** Next page, appended to what is already in the store. */
export const getMoreUserReviews = async (dispatch, { offset, ...query } = {}) =>
  getUserReviews(dispatch, { ...query, offset, append: true });

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
    const payload = response?.data?.data;
    const reply = payload?.reply;
    if (!reply) {
      throw new Error("AI service returned an empty reply");
    }

    // The server flags drafts it wrote from a static template because OpenAI is
    // unconfigured or erroring. That used to be invisible here — only `reply`
    // was read — so a canned sentence was presented as a model-written reply.
    // The draft is still worth offering; it just has to be labelled, and the
    // server no longer charges an AI credit for it.
    if (payload.fallback) {
      toast.info(
        response?.data?.message ||
          "AI is unavailable right now — here's a template draft to edit. No AI credits were used.",
      );
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
// Toast policy: everything is toasted here EXCEPT the 403 codes the axios
// interceptor turns into the upgrade modal — stacking a toast on a modal is
// noise. It used to skip ALL 403s, which meant a QUOTA_EXCEEDED reply produced
// no modal (the interceptor didn't handle that code) and no toast (this did
// nothing) — clicking "Sync now" out of quota was completely silent. The
// interceptor now owns both branches of QUOTA_EXCEEDED, so this only needs to
// stay out of its way.
//
// The `dispatch` parameter was accepted and never used. Callers pass one; it
// is ignored rather than dropped from the signature so no call site breaks.
export const syncReviewsNow = async () => {
  try {
    // Walks paginated provider APIs — routinely longer than the 10s default.
    //
    // The body argument is `undefined`, NOT `null`. Axios serialises a null
    // body to the four-character string "null" and still sends
    // Content-Type: application/json, so express.json() on the other end
    // parses it, gets a JSON null where it wants an object, and rejects the
    // request: 400 "Unexpected token 'n', \"null\" is not valid JSON". Every
    // click of "Sync now" 400'd before it reached the controller. With
    // `undefined` axios sends no body and no content-type, express.json()
    // skips it, and the request lands. Do not "tidy" this back to null.
    const { data } = await axiosInstance.post("/reviews/sync", undefined, {
      timeout: LONG_TIMEOUT,
    });
    toast.success(data?.message || "Reviews synced.");
    return data?.data ?? null;
  } catch (error) {
    const code = error.response?.data?.code;
    const serverMsg = error.response?.data?.message;

    if (error.response?.status === 403) {
      // UPGRADE_REQUIRED / SUBSCRIPTION_INACTIVE / QUOTA_EXCEEDED — the
      // interceptor owns the UI for all three (modal or toast).
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