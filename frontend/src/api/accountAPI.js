// frontend/src/api/accountAPI.js
//
// Account recovery and email verification.
//
// These are the only API calls in the app made by someone who is NOT signed in
// (except login/register), so none of them go near the auth slice or the
// axios Authorization header — the emailed token is the whole credential.
//
// Errors are thrown rather than swallowed. Each of these screens is a
// single-purpose page whose entire job is to report the outcome, so the caller
// always has somewhere meaningful to render the failure; a toast-and-continue
// would leave the user staring at a form with no idea what happened.

import axiosInstance from "../utils/axios.helper.js";

/** Extracts the server's sentence, falling back to something useful. */
export const messageFrom = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

export const accountAPI = {
  /**
   * Ask for a reset link.
   *
   * The server answers identically whether or not the account exists — that is
   * deliberate (account enumeration), so this resolves rather than throwing for
   * an unknown address, and the UI must show the same confirmation either way.
   * Do not "improve" this by trying to detect the unknown-email case.
   */
  forgotPassword: async (email) => {
    const { data } = await axiosInstance.post("/auth/forgot-password", { email });
    return data;
  },

  resetPassword: async ({ token, newPassword }) => {
    const { data } = await axiosInstance.post("/auth/reset-password", {
      token,
      newPassword,
    });
    return data;
  },

  verifyEmail: async (token) => {
    const { data } = await axiosInstance.post("/auth/verify-email", { token });
    return data?.data ?? {};
  },

  /** Authenticated — triggered from Settings by someone already signed in. */
  resendVerification: async () => {
    const { data } = await axiosInstance.post("/auth/resend-verification");
    return data;
  },

  /** Public: describes an invitation so the accept page can name the clinic. */
  previewInvitation: async (token) => {
    const { data } = await axiosInstance.get(
      `/clinic/members/invitations/${encodeURIComponent(token)}`,
    );
    return data?.data ?? null;
  },

  /**
   * Accept an invitation. `name` and `password` are only sent when the invited
   * address has no account yet — an existing user must not be asked to invent a
   * new password for the account they already have.
   */
  acceptInvitation: async ({ token, name, password }) => {
    const body = { token };
    if (name) body.name = name;
    if (password) body.password = password;
    const { data } = await axiosInstance.post("/auth/accept-invite", body);
    return data?.data ?? null;
  },
};

export default accountAPI;
