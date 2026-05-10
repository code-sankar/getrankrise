import api from "./axiosInstance.js";

export const adminAPI = {
  // Fetch profile from backend
  getProfile: async () => {
    const { data } = await api.get("/admin/profile");
    return data;
  },

  // Update profile
  updateProfile: async (profileData) => {
    const { data } = await api.put("/admin/profile", profileData);
    return data;
  },

  // Change password
  changePassword: async (current, newPass) => {
    const { data } = await api.put("/admin/password", { current, newPass });
    return data;
  },

  // Update notification preferences
  updateNotifications: async (prefs) => {
    const { data } = await api.put("/admin/notifications", prefs);
    return data;
  },

  // Fetch activity log
  getActivity: async () => {
    const { data } = await api.get("/admin/activity");
    return data;
  },
};