import { configureStore } from "@reduxjs/toolkit";
import authReducer          from "./authSlice.js";
import reviewsReducer       from "./reviewsSlice.js";
import notificationsReducer from "./notificationsSlice.js";
import requestsReducer      from "./requestsSlice.js";
import analyticsReducer     from "./analyticsSlice.js";
import userReducer         from "./userSlice.js";
import upgradeModalReducer from "./upgradeModalSlice.js";
import competitorsReducer from "./competitorsSlice.js";

const store = configureStore({
  reducer: {
    auth:          authReducer,
    reviews:       reviewsReducer,
    notifications: notificationsReducer,
    requests:      requestsReducer,
    analytics:     analyticsReducer,
    user:          userReducer,
    upgradeModal: upgradeModalReducer,
    competitors:   competitorsReducer
  },
});

export default store;