// frontend/src/hooks/credits.hook.js
import axiosInstance from "../utils/axios.helper.js";

export const getUserCredits = async () => {
  try {
    const { data } = await axiosInstance.get("/subscription/credits");
    return data?.data || null;
  } catch (err) {
    console.error("getUserCredits error:", err);
    return null;
  }
};