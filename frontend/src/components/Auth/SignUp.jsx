import { useState } from "react";
import { useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import axiosInstance from "../../utils/axios.helper.js";
import { getFriendlyError } from "../../utils/parseErrorMsg.js";
import {
  loginStart,
  loginSuccess,
  loginFailure,
} from "../../store/authSlice.js";
import Logo from "../Logo";
import Input from "../Input";
import Button from "../Button";
import { icons } from "../../assets/Icons.jsx";

function SignUp() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const password = watch("password");

  const signup = async (data) => {
    setError("");
    setLoading(true);
    dispatch(loginStart());

    try {
      const response = await axiosInstance.post("/auth/register", {
        name:       data.fullName,
        email:      data.email,
        password:   data.password,
        clinicName: data.clinicName,
      });

      // Backend createdResponse shape: { success, data: { accessToken, user } }
      const payload = response?.data?.data;
      if (!payload?.accessToken) {
        throw new Error("Unexpected response from server");
      }

      // Auto-login the new user — better UX than redirecting to login
      dispatch(loginSuccess(payload));
      toast.success("Welcome to Kirtify! 🎉");
      // Straight to onboarding, not the dashboard: a brand-new clinic has no
      // platform connected, so the dashboard is necessarily empty. Onboarding
      // collects clinic details and walks them through connecting Google.
      navigate("/onboarding");
    } catch (err) {
      const msg = getFriendlyError(
        err?.response?.data?.message || err?.message
      );
      setError(msg || "Could not create your account. Please try again.");
      dispatch(loginFailure(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-white flex items-center justify-center p-4 sm:p-8 selection:bg-cyan-500/30">
      
      {/* Ambient lighting */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
      
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <div className="relative w-full max-w-xl bg-gradient-to-b from-[#0d121f]/80 to-[#06080d]/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] my-8">
        
        <div className="flex justify-center mb-6">
          <Link to="/" className="group flex items-center transition-transform duration-300 ease-out hover:scale-105">
            <div className="relative p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-inner group-hover:border-cyan-500/30 transition-colors duration-300">
              <Logo />
            </div>
          </Link>
        </div>

        <div className="space-y-1.5 text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Create your account
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Start your 14-day free trial — no card required.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm py-3 px-4 rounded-xl text-center mb-6 animate-[fadeIn_0.2s_ease-out]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            <p className="w-full text-center font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(signup)} className="space-y-5">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1">
              <Input
                label="Full Name"
                required
                className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200 shadow-inner"
                placeholder="Jane Doe"
                {...register("fullName", {
                  required: true,
                  minLength: { value: 2, message: "Name must be at least 2 characters" },
                  maxLength: { value: 100, message: "Name cannot exceed 100 characters" },
                })}
              />
              {errors.fullName?.type === "required" && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> Full name is required
                </p>
              )}
              {errors.fullName?.message && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> {errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                label="Business / Clinic Name"
                required
                className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200 shadow-inner"
                placeholder="Bright Smile Dental"
                {...register("clinicName", {
                  required: true,
                  minLength: { value: 2, message: "Must be at least 2 characters" },
                  maxLength: { value: 150, message: "Cannot exceed 150 characters" },
                })}
              />
              {errors.clinicName?.type === "required" && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> Business name is required
                </p>
              )}
              {errors.clinicName?.message && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> {errors.clinicName.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200 shadow-inner"
              required
              {...register("email", {
                required: true,
                validate: {
                  matchPattern: (value) =>
                    /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value) ||
                    "Enter a valid email address",
                },
              })}
            />
            {errors.email?.type === "required" && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> Email is required
              </p>
            )}
            {errors.email?.message && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200 shadow-inner"
              required
              {...register("password", {
                required: true,
                minLength: { value: 8, message: "Password must be at least 8 characters" },
              })}
            />
            {errors.password?.type === "required" && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> Password is required
              </p>
            )}
            {errors.password?.message && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Input
              label="Confirm Password"
              type="password"
              placeholder="Re-enter your password"
              className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200 shadow-inner"
              required
              {...register("confirmPassword", {
                required: true,
                validate: (value) =>
                  value === password || "Passwords do not match",
              })}
            />
            {errors.confirmPassword?.message && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl font-semibold text-white shadow-lg shadow-cyan-600/10 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:brightness-110"
            bgColor={loading ? "bg-cyan-950/60" : "bg-gradient-to-r from-cyan-500 to-blue-600"}
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin flex items-center justify-center opacity-80">
                {icons.loading}
              </span>
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <div className="relative flex items-center my-6">
          <div className="flex-grow border-t border-white/[0.04]"></div>
          <span className="flex-shrink mx-4 text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-widest uppercase">OR</span>
          <div className="flex-grow border-t border-white/[0.04]"></div>
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="inline-block font-bold text-cyan-400 hover:text-cyan-300 transition-colors duration-200 underline underline-offset-4 decoration-cyan-500/40 hover:decoration-cyan-400"
          >
            Sign in now
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignUp;