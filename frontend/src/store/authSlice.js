// import { createSlice } from "@reduxjs/toolkit";

// const initialState = {
//   status: false,
//   userData: null,
// };

// const authSlice = createSlice({
//   name: "auth",
//   initialState,
//   reducers: {
//     setUser: (state, action) => {
//       state.status = true;
//       state.userData = action.payload;
//     },
//     unSetUser: (state) => {
//       state.status = true;
//       state.userData = null;
//     },
//   },
// });

// export const { setUser, unSetUser } = authSlice.actions;
// export default authSlice.reducer;


import { createSlice } from "@reduxjs/toolkit";

// ── Load initial state from localStorage ─────────────────────────────────────
// This means if the user refreshes the page, they stay logged in
const token      = localStorage.getItem("token")      || null;
const clinicName = localStorage.getItem("clinicName") || null;
const userEmail  = localStorage.getItem("userEmail")  || null;
// ─────────────────────────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token,           // JWT token (or mock token for now)
    clinicName,      // e.g. "Bright Smile Dental"
    userEmail,       // e.g. "sarah@brightsmile.com"
    isAuthenticated: !!token, // true if token exists
    loading: false,
    error: null,
  },
  reducers: {

    // Called when login starts (shows loading state)
    loginStart(state) {
      state.loading = true;
      state.error   = null;
    },

    // Called when login succeeds
    loginSuccess(state, action) {
      const { token, clinicName, userEmail } = action.payload;
      state.token           = token;
      state.clinicName      = clinicName;
      state.userEmail       = userEmail;
      state.isAuthenticated = true;
      state.loading         = false;
      state.error           = null;

      // Persist to localStorage so state survives page refresh
      localStorage.setItem("token",      token);
      localStorage.setItem("clinicName", clinicName);
      localStorage.setItem("userEmail",  userEmail);
    },

    // Called when login fails
    loginFailure(state, action) {
      state.loading = false;
      state.error   = action.payload; // error message string
    },

    // Called when user logs out
    logout(state) {
      state.token           = null;
      state.clinicName      = null;
      state.userEmail       = null;
      state.isAuthenticated = false;
      state.loading         = false;
      state.error           = null;

      // Clear localStorage
      localStorage.removeItem("token");
      localStorage.removeItem("clinicName");
      localStorage.removeItem("userEmail");
    },

    // Called when clinic name is updated in Settings
    updateClinicName(state, action) {
      state.clinicName = action.payload;
      localStorage.setItem("clinicName", action.payload);
    },

    // Clear any auth errors (e.g. when user starts typing again)
    clearError(state) {
      state.error = null;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  updateClinicName,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;