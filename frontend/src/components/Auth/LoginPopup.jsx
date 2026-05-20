import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { setUser } from "../../store/authSlice";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import axiosInstance from "../../utils/axios.helper.js";
import Logo from "../Logo";
import Input from "../Input";
import Button from "../Button";
import { icons } from "../../assets/Icons.jsx";
import { IoClose } from "react-icons/io5";

function LoginPopup({ route, message = "Login to continue..." }, ref) {
  const dialog = useRef();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  useImperativeHandle(ref, () => {
    return {
      open() {
        setShowPopup(true);
      },
      close() {
        handleClose();
      },
    };
  }, []);

  useEffect(() => {
    if (showPopup) {
      dialog.current.showModal();
    }
  }, [showPopup]);

  const login = async (data) => {
    setError("");
    setLoading(true);
    try {
      const response = await axiosInstance.post("/users/login", data);
      if (response?.data?.data) {
        dispatch(setUser(response.data.data.user));
        localStorage.setItem("accessToken", response.data.data.accessToken);
        toast.success(response.data.message + "🤩");
        if (route) {
          navigate(route);
        }
        dialog.current.close();
      }
    } catch (error) {
      if (error.status === 401) {
        setError("Invalid password");
      } else if (error.status === 500) {
        setError("Server is not working");
      } else if (error.status === 404) {
        setError("User does not exist");
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    dialog.current.close();
    setShowPopup(false);
    if (route) navigate(route);
  };

  return (
    <div className="absolute">
      {showPopup &&
        createPortal(
          <dialog
            ref={dialog}
            onClose={handleClose}
            className="mx-auto w-[92%] sm:w-[60%] lg:w-[45%] xl:w-[32%] max-w-md rounded-2xl bg-gradient-to-b from-[#181236]/95 to-[#0f0a24]/98 text-white border border-white/[0.08] backdrop:backdrop-blur-md shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] p-0 overflow-hidden outline-none animate-[fadeIn_0.2s_ease-out]"
          >
            {/* Modal Content Wrapper */}
            <div className="relative p-6 sm:p-8 flex flex-col w-full selection:bg-pink-500/30">
              {/* Premium Close Button Component */}
              <button
                autoFocus
                type="button"
                onClick={handleClose}
                className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] rounded-xl transition-all duration-200 outline-none focus:ring-2 focus:ring-pink-500/40"
                aria-label="Close modal"
              >
                <IoClose className="w-5 h-5" />
              </button>

              {/* Logo Presentation Area */}
              <div className="flex justify-center mb-5 mt-2">
                <div className="relative p-2 rounded-xl bg-white/[0.01] border border-white/[0.04]">
                  <Logo />
                </div>
              </div>

              {/* Context Title Header */}
              <div className="space-y-1 text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent px-6">
                  {message}
                </h2>
              </div>

              {/* Global Error Banner */}
              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm py-2.5 px-4 rounded-xl text-center mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                  <p className="w-full text-center font-medium">{error}</p>
                </div>
              )}

              {/* Main Login Form Input Deck */}
              <form onSubmit={handleSubmit(login)} className="space-y-4 w-full">
                {/* Email input field */}
                <div className="space-y-1">
                  <Input
                    label="Email Address"
                    placeholder="name@example.com"
                    type="email"
                    className="w-full px-4 py-2.5 bg-[#0a0618]/90 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/80 focus:ring-4 focus:ring-pink-500/10 transition-all duration-200"
                    required
                    {...register("email", {
                      required: true,
                      validate: {
                        matchPattern: (value) =>
                          /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(
                            value,
                          ) || "Email address must be a valid address",
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

                {/* Password input field */}
                <div className="space-y-1">
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-[#0a0618]/90 border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/80 focus:ring-4 focus:ring-pink-500/10 transition-all duration-200"
                    className2="pt-1"
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
                  className="w-full mt-2 py-2.5 rounded-xl font-semibold text-white shadow-lg shadow-pink-600/10 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:brightness-110"
                  bgColor={
                    loading
                      ? "bg-pink-950/60"
                      : "bg-gradient-to-r from-pink-600 via-pink-500 to-rose-500"
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

              {/* Custom Decorative Divider */}
              <div className="relative flex items-center my-5">
                <div className="flex-grow border-t border-white/[0.04]"></div>
                <span className="flex-shrink mx-3 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                  OR
                </span>
                <div className="flex-grow border-t border-white/[0.04]"></div>
              </div>

              {/* Secondary Redirect Action Footer */}
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
          </dialog>,
          document.getElementById("popup-models"),
        )}
    </div>
  );
}

export default React.forwardRef(LoginPopup);
