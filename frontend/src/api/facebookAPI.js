/**
 * facebookAPI.js
 * Thin wrapper over /api/v1/oauth/facebook/* — the Facebook connect flow.
 * OAuth-redirect based like Google (consent screen → callback → Page picker).
 * Same axios client + { success, message, data } envelope as googleAPI.js.
 */

import axiosInstance from "../utils/axios.helper.js";

export const facebookAPI = {
  /** All platform connections for this clinic (shared endpoint). */
  getConnections: async () => {
    const { data } = await axiosInstance.get("/oauth/connections");
    return data.data.connections;
  },

  /**
   * Step 1: get the Facebook consent URL. Caller must do a FULL page
   * navigation — window.location.href = consentUrl.
   * Throws err.notConfigured=true when the server has no FACEBOOK_APP_ID.
   */
  startConnect: async () => {
    try {
      const { data } = await axiosInstance.get("/oauth/facebook/connect");
      return data.data.consentUrl;
    } catch (err) {
      if (err.response?.data?.code === "FACEBOOK_NOT_CONFIGURED") {
        const e = new Error(err.response.data.message);
        e.notConfigured = true;
        throw e;
      }
      throw err;
    }
  },

  /**
   * Step 2 (after the callback redirected back with ?facebook=connected):
   * the Pages the user manages.
   * Throws err.fbPermission=true when Facebook hasn't approved page perms yet.
   */
  getPages: async () => {
    try {
      const { data } = await axiosInstance.get("/oauth/facebook/pages");
      return data.data.pages; // [{ id, name, category }]
    } catch (err) {
      if (err.response?.data?.code === "FB_PERMISSION") {
        const e = new Error(err.response.data.message);
        e.fbPermission = true;
        throw e;
      }
      throw err;
    }
  },

  /** Step 3: bind the chosen Page to this clinic. */
  selectPage: async ({ pageId, pageName }) => {
    const { data } = await axiosInstance.post("/oauth/facebook/select-page", {
      pageId,
      pageName,
    });
    return data.data; // safe connection JSON
  },

  disconnect: async () => {
    const { data } = await axiosInstance.delete("/oauth/facebook");
    return data.data;
  },
};