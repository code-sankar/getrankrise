/**
 * googleAPI.js
 * Thin wrapper over /api/v1/oauth/* — the Google connect flow.
 * Uses the single surviving axios client (auto-JWT, refresh, upgrade-modal
 * interceptor). Every backend response is { success, message, data }.
 */

import axiosInstance from "../utils/axios.helper.js";

// Where the OAuth callback should send the browser back to. Defaults to the
// page the user started the connect from — so connecting from Settings returns
// to Settings, not onboarding. The value is validated server-side (must be a
// same-origin relative path) before it is ever used in a redirect.
const defaultReturnTo = () =>
  typeof window !== "undefined" ? window.location.pathname : "/onboarding";

export const googleAPI = {
  /** All platform connections for this clinic → [{ platform, status, ... }] */
  getConnections: async () => {
    const { data } = await axiosInstance.get("/oauth/connections");
    return data.data.connections;
  },

  /**
   * Step 1: get the Google consent URL. Caller must then do a FULL page
   * navigation — window.location.href = consentUrl — because the consent
   * screen cannot render inside an XHR and Google will bounce an iframe.
   * `returnTo` rides the signed state and brings the user back to this page
   * after the callback.
   */
  startConnect: async (returnTo = defaultReturnTo()) => {
    const { data } = await axiosInstance.get("/oauth/google/connect", {
      params: { returnTo },
    });
    return data.data.consentUrl;
  },

  /**
   * Step 2 (after the callback redirected back with ?google=connected):
   * accounts + locations for the picker.
   * Throws err.gbpNotApproved=true when Google hasn't approved API access yet.
   */
  getLocations: async () => {
    try {
      const { data } = await axiosInstance.get("/oauth/google/locations");
      return data.data.accounts; // [{ account: {id,name}, locations: [{id,name,address}] }]
    } catch (err) {
      if (err.response?.data?.code === "GBP_NOT_APPROVED") {
        const e = new Error(err.response.data.message);
        e.gbpNotApproved = true;
        throw e;
      }
      throw err;
    }
  },

  /** Step 3: bind the chosen location to this clinic. */
  selectLocation: async ({ accountId, accountName, locationId, locationName }) => {
    const { data } = await axiosInstance.post("/oauth/google/select-location", {
      accountId,
      accountName,
      locationId,
      locationName,
    });
    return data.data; // safe connection JSON
  },

  disconnect: async () => {
    const { data } = await axiosInstance.delete("/oauth/google");
    return data.data;
  },
};