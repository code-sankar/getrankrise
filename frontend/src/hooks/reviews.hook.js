/**
 * reviews.hook.js
 * All API calls related to reviews.
 * Dispatches to both userSlice and reviewsSlice after responses.
 *
 * Usage:
 *   import { getUserReviews, replyToReview } from "../hooks/reviews.hook";
 *   await getUserReviews(dispatch);
 */

import { toast } from "react-toastify";
import axiosInstance from "../utils/axios.helper.js";
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
} from "../store/reviewsSlice.js";

// ── Fetch all reviews for the clinic ─────────────────────────────────────────
export const getUserReviews = async (dispatch) => {
  dispatch(fetchReviewsStart());
  try {
    const response = await axiosInstance.get("/reviews");
    if (response?.data?.data) {
      const reviews = response.data.data;
      // Dispatch to both slices so Dashboard and Profile both stay in sync
      dispatch(addUserReviews(reviews));
      dispatch(fetchReviewsSuccess(reviews));
      return response.data;
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    dispatch(fetchReviewsFailure(msg));
    console.error("getUserReviews error:", error);
  }
};

// ── Clear reviews from store (e.g. on logout) ─────────────────────────────────
export const clearUserReviews = (dispatch) => {
  dispatch(removeUserReviews());
};

// ── Post a reply to a review ──────────────────────────────────────────────────
export const replyToReview = async (dispatch, reviewId, replyText) => {
  try {
    const response = await axiosInstance.post(`/reviews/${reviewId}/reply`, {
      reply: replyText,
    });
    if (response?.data) {
      // Update both slices so review shows as replied everywhere
      dispatch(toggleUserReviewReplied(reviewId));
      dispatch(markReplied(reviewId));

      // Log this as an activity
      dispatch(addSingleUserActivity({
        _id:    Date.now().toString(),
        action: "Replied to a patient review",
        time:   "Just now",
        icon:   "💬",
        type:   "success",
      }));

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
export const generateAIReply = async (reviewId, reviewText) => {
  try {
    const response = await axiosInstance.post(`/reviews/${reviewId}/ai-reply`, {
      reviewText,
    });
    if (response?.data?.data) {
      return response.data.data.reply; // returns the generated reply string
    }
  } catch (error) {
    const msg = getFriendlyError(error.response?.data?.message);
    toast.error(msg);
    console.error("generateAIReply error:", error);
    throw error;
  }
};

// ── Fetch reviews filtered by platform ───────────────────────────────────────
export const getReviewsByPlatform = async (dispatch, platform) => {
  dispatch(fetchReviewsStart());
  try {
    const response = await axiosInstance.get("/reviews", {
      params: { platform },
    });
    if (response?.data?.data) {
      dispatch(fetchReviewsSuccess(response.data.data));
      return response.data;
    }
  } catch (error) {
    dispatch(fetchReviewsFailure(error.message));
    console.error("getReviewsByPlatform error:", error);
  }
};