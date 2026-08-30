import { useState } from "react";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { loginStart, loginSuccess, loginFailure } from "../../store/authSlice";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import axiosInstance from "../../utils/axios.helper.js";
import { getFriendlyError } from "../../utils/parseErrorMsg.js";
import Logo from "../Logo";
import Input from "../Input";
import Button from "../Button";
import { icons } from "../../assets/Icons.jsx";
import {
  MOCK_TOKEN,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  MOCK_USER,
  DEMO_AUTH_ENABLED,
} from "../../mocks/mockAuth.js";

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const login = async (data) => {
    setError("");
    setLoading(true);
    dispatch(loginStart());

    // ── Demo login: bypass the backend when the demo credentials are used ──
    // Dev-only. `DEMO_AUTH_ENABLED` is false in `vite build`, so Vite strips
    // this entire block (and the mock constants) from the production bundle.
    if (
      DEMO_AUTH_ENABLED &&
      data.email.trim().toLowerCase() === DEMO_EMAIL &&
      data.password === DEMO_PASSWORD
    ) {
      dispatch(loginSuccess({ accessToken: MOCK_TOKEN, user: MOCK_USER }));
      toast.success("Signed in with the demo account");
      navigate("/dashboard");
      setLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.post("/auth/login", {
        email: data.email,
        password: data.password,
      });

      // Backend successResponse shape: { success, data: { accessToken, user } }
      const payload = response?.data?.data;
      if (!payload?.accessToken) {
        throw new Error("Unexpected response from server");
      }

      dispatch(loginSuccess(payload));
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      const msg = getFriendlyError(
        err?.response?.data?.message || err?.message,
      );
      setError(msg || "Could not sign you in. Please try again.");
      dispatch(loginFailure(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-white flex items-center justify-center p-4 sm:p-6 selection:bg-cyan-500/30">
      {/* Premium Ambient Light Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />

      {/* Subtly Textured Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Main Glassmorphic Login Card */}
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#0d121f]/80 to-[#06080d]/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-300">
        {/* Logo Section */}
        <div className="flex justify-center mb-8">
          <Link
            to="/"
            className="group flex items-center transition-transform duration-300 ease-out hover:scale-105"
          >
            <div className="relative p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-inner group-hover:border-cyan-500/30 transition-colors duration-300">
              <Logo />
            </div>
          </Link>
        </div>

        {/* Title Group */}
        <div className="space-y-1.5 text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Welcome back
          </h2>
          <p className="text-sm text-slate-400 font-medium">
            Sign in to your Kirtify account
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm py-3 px-4 rounded-xl text-center mb-6 animate-[fadeIn_0.2s_ease-out]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            <p className="w-full text-center font-medium">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(login)} className="space-y-5">
          <div className="space-y-1">
            <Input
              label="Email Address"
              placeholder="name@example.com"
              type="email"
              className="w-full px-4 py-2.5 bg-[#0a0618]/90 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200"
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
              placeholder="Your password"
              className="w-full px-4 py-2.5 bg-[#0a0618]/90 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200"
              required
              {...register("password", { required: true })}
            />
            {errors.password?.type === "required" && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> Password is required
              </p>
            )}
          </div>

          {/* The entry point to account recovery. Under the password field
              because that is where someone looks the moment they realise they
              cannot remember it. */}
          <div className="flex justify-end -mt-2">
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
            >
              Forgot your password?
            </Link>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-xl font-semibold text-white shadow-lg shadow-cyan-600/10 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:brightness-110"
            bgColor={
              loading
                ? "bg-cyan-950/60"
                : "bg-gradient-to-r from-cyan-500 to-blue-600"
            }
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin flex items-center justify-center opacity-80">
                {icons.loading}
              </span>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <div className="relative flex items-center my-6">
          <div className="flex-grow border-t border-white/[0.04]"></div>
          <span className="flex-shrink mx-3 text-[10px] font-bold text-slate-400 tracking-widest uppercase">
            OR
          </span>
          <div className="flex-grow border-t border-white/[0.04]"></div>
        </div>

        <p className="text-center text-sm text-slate-400">
          Don't have an account yet?{" "}
          <Link
            to="/signup"
            className="inline-block font-bold text-cyan-400 hover:text-cyan-300 transition-colors duration-200 underline underline-offset-4 decoration-cyan-500/40 hover:decoration-cyan-400"
          >
            Sign up now
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
