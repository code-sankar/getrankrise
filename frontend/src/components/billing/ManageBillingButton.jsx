// frontend/src/components/billing/ManageBillingButton.jsx
//
// Opens the Paddle-hosted customer portal (update payment method, cancel, view
// invoices) in a new tab. Mirrors UpgradeButton's shape. The portal link is
// single-use and must not be cached or iframed — we fetch a fresh one per click
// and open it with window.open.
import { useState } from "react";
import { useSelector } from "react-redux";
import { Settings2 } from "lucide-react";
import { toast } from "react-toastify";
import axiosInstance from "../../utils/axios.helper.js";

export default function ManageBillingButton({ className = "", children }) {
  const [loading, setLoading] = useState(false);
  // Owner-only, same as UpgradeButton — the portal is where a subscription gets
  // cancelled. Server-enforced by restrictTo("owner"); this just avoids showing
  // staff a button that can only 403.
  const clinicRole = useSelector((s) => s.auth.clinicRole);

  if (clinicRole && clinicRole !== "owner") return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.post("/billing/portal-session");
      const url = data?.data?.overviewUrl;
      if (!url) throw new Error("No portal URL returned");
      // Paddle portal links shouldn't be iframed → open in a new tab.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "NO_BILLING_ACCOUNT") {
        toast.info("You're on the free plan — upgrade first to manage billing.");
      } else {
        console.error("billing portal error:", err);
        toast.error("Could not open the billing portal. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin opacity-70" />
      ) : (
        <Settings2 size={14} />
      )}
      {children || "Manage billing"}
    </button>
  );
}