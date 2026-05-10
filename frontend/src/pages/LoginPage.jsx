import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  loginStart,
  loginSuccess,
  loginFailure,
  clearError,
} from "../store/authSlice.js";
import { useTheme } from "../context/ThemeContext.jsx";
import logo from "../assets/logo.png";

const DEMO_USER = {
  email: "demo@clinic.com",
  password: "demo123",
  clinicName: "Bright Smile Dental",
  userEmail: "demo@clinic.com",
  token: "demo-token-123",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { dark } = useTheme();
  const { loading, error } = useSelector((state) => state.auth);

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ clinicName: "", email: "", password: "" });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (error) dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(loginStart());
    await new Promise((r) => setTimeout(r, 1000));

    if (mode === "login") {
      if (
        form.email === DEMO_USER.email &&
        form.password === DEMO_USER.password
      ) {
        // TODO: replace with real API → dispatch(loginSuccess(data))
        dispatch(
          loginSuccess({
            token: DEMO_USER.token,
            clinicName: DEMO_USER.clinicName,
            userEmail: DEMO_USER.userEmail,
          }),
        );
        navigate("/dashboard");
      } else {
        dispatch(
          loginFailure(
            "Invalid email or password. Try demo@clinic.com / demo123",
          ),
        );
      }
    } else {
      if (!form.clinicName || !form.email || !form.password) {
        dispatch(loginFailure("Please fill in all fields."));
      } else {
        dispatch(
          loginSuccess({
            token: "new-user-token",
            clinicName: form.clinicName,
            userEmail: form.email,
          }),
        );
        navigate("/dashboard");
      }
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 transition-colors duration-300 ${dark ? "bg-slate-950" : "bg-slate-50"}`}
      style={{
        backgroundImage: dark
          ? "radial-gradient(ellipse at 25% 60%, #0f2a4a 0%, transparent 55%), radial-gradient(ellipse at 75% 20%, #0a1f3a 0%, transparent 50%)"
          : "radial-gradient(ellipse at 25% 60%, #e2e8f0 0%, transparent 55%), radial-gradient(ellipse at 75% 20%, #f1f5f9 0%, transparent 50%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br   mb-4">
            {/* <span className="text-2xl font-black text-white">G</span> */}
            <img src={logo} alt="GetRankRise Logo" srcset="" />
          </div>
          <h1
            className={`text-3xl font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}
          >
            GetRankRise
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Reputation management for clinics
          </p>
        </div>

        {/* Card */}
        <div
          className={`border rounded-2xl p-8 shadow-2xl transition-colors ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
        >
          {/* Toggle */}
          <div
            className={`flex rounded-xl p-1 mb-8 ${dark ? "bg-slate-950" : "bg-slate-100"}`}
          >
            {["login", "signup"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  dispatch(clearError());
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === m ? (dark ? "bg-slate-800 text-blue-400" : "bg-white text-blue-600 shadow-sm") : "text-slate-500 hover:text-slate-400"}`}
              >
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Clinic Name
                </label>
                <input
                  type="text"
                  name="clinicName"
                  value={form.clinicName}
                  onChange={handleChange}
                  placeholder="Bright Smile Dental"
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:border-blue-500 transition-colors ${dark ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"}`}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="doctor@clinic.com"
                className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:border-blue-500 transition-colors ${dark ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"}`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:border-blue-500 transition-colors ${dark ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"}`}
              />
            </div>

            {error && (
              <div
                className={`px-4 py-3 border rounded-xl text-sm ${dark ? "bg-red-950/50 border-red-900 text-red-400" : "bg-red-50 border-red-200 text-red-600"}`}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl text-white text-sm font-bold transition-all active:scale-95 ${loading ? "bg-slate-700 cursor-not-allowed" : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 shadow-lg shadow-indigo-500/25"}`}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>

            {mode === "login" && (
              <p className="text-center text-slate-500 text-xs mt-2">
                Demo:{" "}
                <span className={dark ? "text-slate-300" : "text-slate-700"}>
                  demo@clinic.com / demo123
                </span>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
