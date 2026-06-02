import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../../utils/axios.helper.js";
import Logo from "../Logo";
import Input from "../Input";
import Button from "../Button";
import { icons } from "../../assets/Icons.jsx";
import { toast } from "react-toastify";

function SignUp() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const signup = async (data) => {
    const formData = new FormData();
    for (const key in data) {
      formData.append(key, data[key]);
    }
    formData.append("avatar", data.avatar[0]);
    if (data.coverImage) {
      formData.append("coverImage", data.coverImage[0]);
    }
    setError("");
    setLoading(true);
    try {
      const response = await axiosInstance.post("/users/register", formData);
      if (response?.data?.data) {
        toast.success("Account created successfully 🥳");
        navigate("/login");
      }
    } catch (error) {
      if (error.status === 404 || error.status === 409) {
        setError("User with email or username already exists");
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-white flex items-center justify-center p-4 sm:p-8 selection:bg-blue-500/30">
      
      {/* Premium Ambient Light Background Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
      
      {/* Subtly Textured Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Main Glassmorphic Card (Slightly wider to comfortably accommodate grid layouts) */}
      <div className="relative w-full max-w-xl bg-gradient-to-b from-[#0d121f]/80 to-[#06080d]/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] my-8">
        
        {/* Logo Section */}
        <div className="flex justify-center mb-6">
          <Link to="/" className="group flex items-center transition-transform duration-300 ease-out hover:scale-105">
            <div className="relative p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-inner group-hover:border-blue-500/30 transition-colors duration-300">
              <Logo />
            </div>
          </Link>
        </div>

        {/* Title Group */}
        <div className="space-y-1.5 text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Create your Account
          </h2>
          <p className="text-sm text-slate-400 font-medium">
            Join us today! Please fill in your details.
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm py-3 px-4 rounded-xl text-center mb-6 animate-[fadeIn_0.2s_ease-out]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            <p className="w-full text-center font-medium">{error}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit(signup)} className="space-y-5">
          
          {/* Two-Column Responsive Layout for Text Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div className="space-y-1">
              <Input
                label="Full Name"
                required
                className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-inner"
                placeholder="Enter your full name"
                {...register("fullName", {
                  required: true,
                  maxLength: {
                    value: 25,
                    message: "Full name cannot exceed 25 characters",
                  },
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

            {/* Username */}
            <div className="space-y-1">
              <Input
                label="Username"
                required
                className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-inner"
                placeholder="Choose a username"
                {...register("username", {
                  required: true,
                  maxLength: {
                    value: 25,
                    message: "Username cannot exceed 25 characters",
                  },
                })}
              />
              {errors.username?.type === "required" && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> Username is required
                </p>
              )}
              {errors.username?.message && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> {errors.username.message}
                </p>
              )}
            </div>
          </div>

          {/* Email Field */}
          <div className="space-y-1">
            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-inner"
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

          {/* Password Field */}
          <div className="space-y-1">
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-[#050910]/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/80 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-inner"
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

          {/* File Uploads Section (Styled to look clean within modern dashboards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            {/* Avatar Input */}
            <div className="space-y-1">
              <Input
                label="Avatar Profile"
                type="file"
                required
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 px-3 py-2 bg-[#050910]/40 border border-white/[0.08] rounded-xl cursor-pointer"
                {...register("avatar", {
                  required: true,
                  validate: (file) => {
                    const allowedExtensions = ["image/jpeg", "image/png", "image/jpg"];
                    const fileType = file[0]?.type;
                    return allowedExtensions.includes(fileType)
                      ? true
                      : "Only .png, .jpg and .jpeg files are accepted";
                  },
                })}
              />
              {errors.avatar?.type === "required" && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> Avatar image is required
                </p>
              )}
              {errors.avatar?.message && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> {errors.avatar.message}
                </p>
              )}
            </div>

            {/* Cover Image Input */}
            <div className="space-y-1">
              <Input
                label="Cover Image (Optional)"
                type="file"
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 px-3 py-2 bg-[#050910]/40 border border-white/[0.08] rounded-xl cursor-pointer"
                {...register("coverImage", {
                  required: false,
                  validate: (file) => {
                    if (!file[0]) return true;
                    const allowedExtensions = ["image/jpeg", "image/png", "image/jpg"];
                    const fileType = file[0]?.type;
                    return allowedExtensions.includes(fileType)
                      ? true
                      : "Only .png, .jpg and .jpeg files are accepted";
                  },
                })}
              />
              {errors.coverImage && (
                <p className="text-red-400 text-xs font-medium pt-1 px-1 flex items-center gap-1">
                  <span>⚠️</span> {errors.coverImage.message}
                </p>
              )}
            </div>
          </div>

          {/* Submit Action Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 rounded-xl font-semibold text-white shadow-lg shadow-blue-600/10 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:brightness-110"
            bgColor={loading ? "bg-blue-950/60" : "bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500"}
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin flex items-center justify-center opacity-80">
                {icons.loading}
              </span>
            ) : (
              "Sign Up"
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
          Already have an Account?{" "}
          <Link
            to="/login"
            className="inline-block font-bold text-blue-400 hover:text-blue-300 transition-colors duration-200 underline underline-offset-4 decoration-blue-500/40 hover:decoration-blue-400"
          >
            Sign in now
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignUp;