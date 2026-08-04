import axiosInstance from "../utils/axios.helper";
import { toast } from "react-toastify";

// The API serves this at /api/v1/health (and at /health for platform probes).
// It was previously "/healthcheck", which has never existed on the backend.
export const healthCheck = async () => {
  try {
    const response = await axiosInstance.get("/health");
    return response.data;
  } catch (error) {
    toast.error("Oops! Server is not working");
    console.error("healthCheck error:", error);
    return null;
  }
};
