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

  // ── GDPR: portability and erasure ────────────────────────────────────────

  /**
   * What deletion would actually destroy. Fetched BEFORE the confirmation
   * dialog opens, so the dialog can name real numbers instead of a generic
   * warning — a destructive confirm that cannot say what it destroys is one
   * people click through without reading.
   */
  deletionPreview: async () => {
    const { data } = await axiosInstance.get("/account/deletion-preview");
    return data?.data ?? null;
  },

  /**
   * Downloads the full export.
   *
   * responseType "blob" and a synthetic anchor click, rather than pointing the
   * browser at the URL: the endpoint needs the Authorization header, and a
   * plain navigation cannot carry one. The object URL is revoked immediately —
   * it holds the whole document in memory until it is.
   */
  downloadExport: async () => {
    const res = await axiosInstance.get("/account/export", {
      responseType: "blob",
      // A large clinic's export is a multi-table read; the 10s default is for
      // ordinary CRUD.
      timeout: 60000,
    });

    // The server names the file; fall back only if the header is missing.
    const disposition = res.headers?.["content-disposition"] ?? "";
    const named = /filename="([^"]+)"/.exec(disposition)?.[1];

    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = named || "kirtify-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return { filename: a.download };
  },

  /** Irreversible. The caller is responsible for having confirmed. */
  deleteAccount: async ({ password, confirm }) => {
    const { data } = await axiosInstance.delete("/account", {
      data: { password, confirm },
    });
    return data;
  },
};

export default accountAPI;
