/**
 * googleAPI.js
 * Thin wrapper over /api/v1/oauth/* — the Google connect flow.
 * Uses the single surviving axios client (auto-JWT, refresh, upgrade-modal
 * interceptor). Every backend response is { success, message, data }.
 */

import axiosInstance from "../utils/axios.helper.js";

// Where the OAuth round-trip should land the browser afterwards. The flow can
// start from onboarding OR Settings → Integrations, so default to whatever
// page we're on. The backend allowlists this to same-origin app paths.
const currentPath = () =>
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
   *
   * @param {string} [returnTo] path to return to after consent (defaults to
   *                            the current page). Allowlisted server-side.
   */
  startConnect: async (returnTo = currentPath()) => {
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