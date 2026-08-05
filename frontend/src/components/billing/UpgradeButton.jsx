// frontend/src/components/billing/UpgradeButton.jsx
import { useState } from "react";
import { useSelector } from "react-redux";
import { Zap } from "lucide-react";
import { toast } from "react-toastify";
import axiosInstance from "../../utils/axios.helper.js";
import { loadPaddle } from "../../utils/paddle.loader.js";

export default function UpgradeButton({
  plan       = "starter",
  className  = "",
  children,
}) {
  const [loading, setLoading] = useState(false);
  // Billing is owner-only (restrictTo("owner") on the route). Staff clicking
  // this would get a 403 they can do nothing about, so don't offer it — but
  // note this is PRESENTATION: the server enforces the same rule regardless of
  // what the client renders. `clinicRole` is null on the public pricing page,
  // where there is no session yet and the button must still work.
  const clinicRole = useSelector((s) => s.auth.clinicRole);
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);

  if (isAuthenticated && clinicRole && clinicRole !== "owner") return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.post("/billing/create-checkout", { plan });
      const transactionId = data?.data?.transactionId;
      if (!transactionId) throw new Error("No transactionId returned");

      const Paddle = await loadPaddle();
      Paddle.Checkout.open({
        transactionId,
        settings: {
          theme:       "dark",
          displayMode: "overlay",
          successUrl:  `${window.location.origin}/dashboard?upgrade=success`,
        },
      });
    } catch (err) {
      console.error("upgrade error:", err);
      toast.error("Could not open checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      ) : (
        <Zap size={14} />
      )}
      {children || `Upgrade to ${plan}`}
    </button>
  );
}