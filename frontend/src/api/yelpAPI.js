/**
 * yelpAPI.js
 * Thin wrapper over /api/v1/oauth/yelp/* — the Yelp connect flow. Unlike
 * Google there's no OAuth redirect: just search → bind. Same axios client
 * (auto-JWT, refresh, upgrade-modal interceptor) and { success, message, data }
 * envelope as googleAPI.js.
 */

import axiosInstance from "../utils/axios.helper.js";

export const yelpAPI = {
  /**
   * All platform connections for this clinic (shared endpoint with Google).
   * → [{ platform, status, locationId, locationName, ... }]
   */
  getConnections: async () => {
    const { data } = await axiosInstance.get("/oauth/connections");
    return data.data.connections;
  },

  /**
   * Search Yelp businesses. `location` (city or address) is required; `term`
   * is optional and defaults server-side to the clinic name.
   * → [{ id, alias, name, address, rating, reviewCount, url, imageUrl }]
   *
   * Throws err.yelpNotConfigured=true when the server has no YELP_API_KEY.
   */
  search: async ({ term, location }) => {
    try {
      const { data } = await axiosInstance.get("/oauth/yelp/search", {
        params: { term, location },
      });
      return data.data.businesses;
    } catch (err) {
      if (err.response?.data?.code === "YELP_NOT_CONFIGURED") {
        const e = new Error(err.response.data.message);
        e.yelpNotConfigured = true;
        throw e;
      }
      throw err;
    }
  },

  /**
   * Resolve a pasted Yelp URL (or bare alias/id) to ONE business, so the user
   * can confirm the real name before connecting.
   * → { id, alias, name, address, rating, reviewCount, url, imageUrl }
   *
   * Throws err.yelpNotConfigured=true when the server has no YELP_API_KEY.
   */
  resolve: async ({ ref }) => {
    try {
      const { data } = await axiosInstance.get("/oauth/yelp/business", {
        params: { ref },
      });
      return data.data.business;
    } catch (err) {
      if (err.response?.data?.code === "YELP_NOT_CONFIGURED") {
        const e = new Error(err.response.data.message);
        e.yelpNotConfigured = true;
        throw e;
      }
      throw err;
    }
  },

  /** Bind a chosen Yelp business to this clinic. → safe connection JSON */
  connect: async ({ businessId, businessName }) => {
    const { data } = await axiosInstance.post("/oauth/yelp/connect", {
      businessId,
      businessName,
    });
    return data.data;
  },

  disconnect: async () => {
    const { data } = await axiosInstance.delete("/oauth/yelp");
    return data.data;
  },
};