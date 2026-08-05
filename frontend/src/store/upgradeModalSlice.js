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
    // Which server condition opened this: UPGRADE_REQUIRED (the plan does not
    // include the feature at all), SUBSCRIPTION_INACTIVE (payment problem), or
    // QUOTA_EXCEEDED (the feature is included, the allowance is spent). They
    // read very differently to the user, and the modal used to present all of
    // them as "Upgrade Required" — telling a paying customer who had simply run
    // out for the day that they lacked access.
    reason:         "UPGRADE_REQUIRED",
  },
  reducers: {
    showUpgradeModal: (state, { payload }) => {
      state.open           = true;
      state.currentPlan    = payload?.currentPlan    || "free";
      state.requiredPlans  = payload?.requiredPlans  || ["starter", "premium"];
      state.featureName    = payload?.featureName    || null;
      state.message        = payload?.message        || null;
      state.reason         = payload?.reason         || "UPGRADE_REQUIRED";
    },
    hideUpgradeModal: (state) => { state.open = false; },
  },
});

export const { showUpgradeModal, hideUpgradeModal } = upgradeModalSlice.actions;
export default upgradeModalSlice.reducer;