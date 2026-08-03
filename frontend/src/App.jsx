import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import AppBootstrap from "./components/AppBootstrap.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SendRequests from "./pages/SendRequests.jsx";
import Campaigns from "./pages/Campaigns.jsx";
import Settings from "./pages/Settings.jsx";
import Analytics from "./pages/Analytics.jsx";
import Competitors from "./pages/Competitors.jsx";
import AdminProfile from "./pages/AdminProfile.jsx";
import TermsAndConditions from "./pages/TermsAndConditions.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";
import HelpCenter from "./pages/HelpCenter.jsx";
import ContactUs from "./pages/ContactUs.jsx";
import FAQ from "./pages/QandA.jsx";
import PageNotFound from "./components/PageNotFound.jsx";
import SignUp from "./pages/SignUp.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import LandingPage from "./pages/landingPage/LandingPage.jsx";
import UpgradeModal from "./components/billing/UpgradeModal.jsx";


// Reads isAuthenticated directly from Redux store.
// AppBootstrap guarantees this value is settled before children mount.
function PrivateRoute({ children }) {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Redirect already-authenticated users away from login/signup
function PublicOnlyRoute({ children }) {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppBootstrap>
          <UpgradeModal />
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicOnlyRoute>
                  <SignUp />
                </PublicOnlyRoute>
              }
            />

            {/* Protected */}
            {/* NOTE on /campaigns: this route was missing entirely, so the whole
                Pulse Campaigns UI (Campaigns.jsx + components/campaigns/*) was
                built and unreachable. It is deliberately NOT plan-gated here —
                Campaigns.jsx catches the backend's 403 UPGRADE_REQUIRED and
                renders an inline upsell, which is a better conversion surface
                than a hidden link. Gating in the router would double-enforce
                what requireFeature("pulseCampaignsEnabled") already handles. */}
            {/* Onboarding: the page existed and was fully built but had no
                route, so a new signup landed on an empty Dashboard with no
                connected platform and no path to connect one. SignUp redirects
                here after registering. */}
            <Route path="/onboarding"    element={<PrivateRoute><Onboarding /></PrivateRoute>}    />
            <Route path="/dashboard"     element={<PrivateRoute><Dashboard /></PrivateRoute>}     />
            <Route path="/send-requests" element={<PrivateRoute><SendRequests /></PrivateRoute>}  />
            <Route path="/campaigns"     element={<PrivateRoute><Campaigns /></PrivateRoute>}     />
            <Route path="/settings"      element={<PrivateRoute><Settings /></PrivateRoute>}      />
            <Route path="/analytics"     element={<PrivateRoute><Analytics /></PrivateRoute>}     />
            <Route path="/competitors"   element={<PrivateRoute><Competitors /></PrivateRoute>}   />
            <Route path="/admin"         element={<PrivateRoute><AdminProfile /></PrivateRoute>}  />

            {/* Public info pages — no auth needed */}
            <Route path="/terms"   element={<TermsAndConditions />} />
            <Route path="/privacy" element={<PrivacyPolicy />}      />
            <Route path="/help"    element={<HelpCenter />}         />
            <Route path="/contact" element={<ContactUs />}          />
            <Route path="/faq"     element={<FAQ />}                />

            {/* Fallback */}
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </AppBootstrap>
      </BrowserRouter>
    </ThemeProvider>
  );
}