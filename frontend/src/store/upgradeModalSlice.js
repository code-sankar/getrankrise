// frontend/src/store/upgradeModalSlice.js
import { createSlice } from "@reduxjs/toolkit";

const upgradeModalSlice = createSlice({
  name: "upgradeModal",
  initialState: {
    open:           false,
    currentPlan:    "free",
    requiredPlans:  ["starter", "premium"],
    featureName:    null,
    message:        null,
  },
  reducers: {
    showUpgradeModal: (state, { payload }) => {
      state.open           = true;
      state.currentPlan    = payload?.currentPlan    || "free";
      state.requiredPlans  = payload?.requiredPlans  || ["starter", "premium"];
      state.featureName    = payload?.featureName    || null;
      state.message        = payload?.message        || null;
    },
    hideUpgradeModal: (state) => { state.open = false; },
  },
});

export const { showUpgradeModal, hideUpgradeModal } = upgradeModalSlice.actions;
export default upgradeModalSlice.reducer;