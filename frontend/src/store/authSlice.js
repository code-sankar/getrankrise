import { createSlice } from "@reduxjs/toolkit";

// ── Load initial state from localStorage ─────────────────────────────────────
// Token is the only thing we persist. Everything else (clinicName, userEmail,
// user object) gets re-hydrated from /auth/me on app load by AppBootstrap.
const token = localStorage.getItem("token") || null;

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token,
    user:            null,   // { id, name, email, role }
    clinicName:      null,
    userEmail:       null,
    isAuthenticated: !!token,
    bootstrapped:    false,  // becomes true once AppBootstrap finishes the /auth/me probe
    loading:         false,
    error:           null,
  },
  reducers: {
    // Called when login starts
    loginStart(state) {
      state.loading = true;
      state.error   = null;
    },

    // Called when login or register succeeds — payload shape matches backend response
    // { accessToken, user: { id, name, email, role, clinicName } }
    loginSuccess(state, action) {
      const { accessToken, user } = action.payload;
      state.token           = accessToken;
      state.user            = {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      };
      state.userEmail       = user.email;
      state.clinicName      = user.clinicName || null;
      state.isAuthenticated = true;
      state.bootstrapped    = true;
      state.loading         = false;
      state.error           = null;

      localStorage.setItem("token", accessToken);
    },

    loginFailure(state, action) {
      state.loading = false;
      state.error   = action.payload;
    },

    // Used by AppBootstrap after /auth/me succeeds
    // payload: { user: {...}, clinic: { clinicName, ... } | null }
    hydrateSession(state, action) {
      const { user, clinic } = action.payload;
      state.user = {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      };
      state.userEmail       = user.email;
      state.clinicName      = clinic?.clinicName || null;
      state.isAuthenticated = true;
      state.bootstrapped    = true;
    },

    // Called once the bootstrap probe finishes, whether or not a session was found
    setBootstrapped(state) {
      state.bootstrapped = true;
    },

    // Called when user logs out
    logout(state) {
      state.token           = null;
      state.user            = null;
      state.clinicName      = null;
      state.userEmail       = null;
      state.isAuthenticated = false;
      state.loading         = false;
      state.error           = null;
      state.bootstrapped    = true;
      localStorage.removeItem("token");
    },

    // Called when clinic name is updated in Settings
    updateClinicName(state, action) {
      state.clinicName = action.payload;
    },

    clearError(state) {
      state.error = null;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  hydrateSession,
  setBootstrapped,
  logout,
  updateClinicName,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;