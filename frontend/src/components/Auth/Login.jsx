import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
// 1. Import loginSuccess instead of setUser to trigger the correct reducer states
import { loginSuccess } from "../../store/authSlice"; 
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Logo from "../Logo";
import Input from "../Input";
import Button from "../Button";
import { icons } from "../../assets/Icons.jsx";

// Define your static mock user credentials matching your slice requirements
const DEMO_USER = {
  email: "demo@example.com",
  password: "password123",
  profile: {
    token: "mock_jwt_access_token_xyz789", // authSlice looks for 'token'
    clinicName: "Bright Smile Dental",     // authSlice tracks clinicName
    userEmail: "demo@example.com"          // authSlice tracks userEmail
  }
};

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: DEMO_USER.email,
      password: DEMO_USER.password
    }
  });

  const login = async (data) => {
    setError("");
    setLoading(true);

    // Simulate network lag for realism (500ms)
    setTimeout(() => {
      if (data.email === DEMO_USER.email && data.password === DEMO_USER.password) {
        
        // 2. Dispatch loginSuccess with the payload keys your reducer expects.
        // This will automatically set isAuthenticated to true AND handle localStorage for you!
        dispatch(loginSuccess(DEMO_USER.profile));
        
        toast.success("Logged in successfully with Demo Account!");
        setLoading(false);
        
        // 3. This navigation will now execute perfectly without getting blocked
        navigate("/dashboard");
      } else {
        setLoading(false);
        if (data.email !== DEMO_USER.email) {
          setError("User does not exist");
        } else {
          setError("Invalid password");
        }
      }
    }, 500);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0516] text-white flex items-center justify-center p-4 sm:p-6 selection:bg-pink-500/30">
      
      {/* Premium Ambient Light Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-pink-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
      
      {/* Subtly Textured Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Main Glassmorphic Login Card */}
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#161130]/80 to-[#100b24]/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-300">
        
        {/* Logo Section */}
        <div className="flex justify-center mb-8">
          <Link to="/" className="group flex items-center transition-transform duration-300 ease-out hover:scale-105">
            <div className="relative p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-inner group-hover:border-pink-500/30 transition-colors duration-300">
              <Logo />
            </div>
          </Link>
        </div>

        {/* Title Group */}
        <div className="space-y-1.5 text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-sm text-slate-300 font-medium">
            Log in to your account to continue
          </p>
        </div>

        {/* Demo Credentials Tip Box */}
        <div className="bg-pink-500/5 border border-pink-500/20 rounded-xl p-3 mb-6 text-xs text-pink-300 space-y-1">
          <p className="font-semibold text-pink-400 flex items-center gap-1">✨ Frontend Demo Mode</p>
          <p>Email: <span className="text-white font-mono">{DEMO_USER.email}</span></p>
          <p>Password: <span className="text-white font-mono">{DEMO_USER.password}</span></p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm py-3 px-4 rounded-xl text-center mb-6 animate-[fadeIn_0.2s_ease-out]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            <p className="w-full text-center font-medium">{error}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit(login)} className="space-y-5">
          
          {/* Email input Wrapper */}
          <div className="space-y-1">
            <Input
              label="Email Address"
              placeholder="name@example.com"
              type="email"
              className="w-full px-4 py-3 bg-[#0d091a]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/80 focus:ring-4 focus:ring-pink-500/10 transition-all duration-200 shadow-inner"
              required
              {...register("email", {
                required: true,
                validate: {
                  matchPattern: (value) =>
                    /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value) ||
                    "Email address must be a valid address",
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

          {/* Password Input Wrapper */}
          <div className="space-y-1">
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-[#0d091a]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/80 focus:ring-4 focus:ring-pink-500/10 transition-all duration-200 shadow-inner"
              className2="pt-1 text-slate-300 font-medium"
              required
              {...register("password", {
                required: true,
              })}
            />
            {errors.password?.type === "required" && (
              <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                <span>⚠️</span> Password is required
              </p>
            )}
          </div>

          {/* Submit Action Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 rounded-xl font-semibold text-white shadow-lg shadow-pink-600/10 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:brightness-110"
            bgColor={loading ? "bg-pink-950/60" : "bg-gradient-to-r from-pink-600 via-pink-500 to-rose-500"}
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

        {/* Custom Decorative Divider */}
        <div className="relative flex items-center my-6">
          <div className="flex-grow border-t border-white/[0.04]"></div>
          <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 tracking-widest uppercase">OR</span>
          <div className="flex-grow border-t border-white/[0.04]"></div>
        </div>

        {/* Interactive Footer Link */}
        <p className="text-center text-sm text-slate-400">
          Don't have an Account yet?{" "}
          <Link
            to="/signup"
            className="inline-block font-bold text-pink-400 hover:text-pink-300 transition-colors duration-200 underline underline-offset-4 decoration-pink-500/40 hover:decoration-pink-400"
          >
            Sign up now
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;