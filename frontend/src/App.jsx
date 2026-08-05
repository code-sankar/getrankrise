import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { ThemeProvider } from "./context/ThemeProvider.jsx";
import AppBootstrap from "./components/AppBootstrap.jsx";
import UpgradeModal from "./components/billing/UpgradeModal.jsx";

// ── Route-level code splitting ──────────────────────────────────────────────
// Every page used to be a static import, so the build produced ONE 1.08MB
// chunk that had to be downloaded and parsed before anything appeared. A
// visitor on the marketing page was paying for the whole authenticated app,
// the charting library, and 650 lines of privacy policy before they saw a
// headline.
//
// The landing page and login stay EAGER on purpose: they are the first thing
// most visitors see, and lazy-loading them would trade one big download for a
// blank screen plus a second round trip on the most latency-sensitive route in
// the product. Everything behind auth, and the long static legal pages, load on
// demand.
import LandingPage from "./pages/landingPage/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignUp from "./pages/SignUp.jsx";
import PageNotFound from "./components/PageNotFound.jsx";

const Dashboard          = lazy(() => import("./pages/Dashboard.jsx"));
const SendRequests       = lazy(() => import("./pages/SendRequests.jsx"));
const Campaigns          = lazy(() => import("./pages/Campaigns.jsx"));
const Settings           = lazy(() => import("./pages/Settings.jsx"));
const Analytics          = lazy(() => import("./pages/Analytics.jsx"));
const Competitors        = lazy(() => import("./pages/Competitors.jsx"));
const AdminProfile       = lazy(() => import("./pages/AdminProfile.jsx"));
const Onboarding         = lazy(() => import("./pages/Onboarding.jsx"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions.jsx"));
const PrivacyPolicy      = lazy(() => import("./pages/PrivacyPolicy.jsx"));
const HelpCenter         = lazy(() => import("./pages/HelpCenter.jsx"));
const ContactUs          = lazy(() => import("./pages/ContactUs.jsx"));
const FAQ                = lazy(() => import("./pages/QandA.jsx"));

// Shown while a lazy route's chunk is in flight. Deliberately the same shell
// AppBootstrap uses for its session probe, so a cold navigation looks like one
// continuous load rather than two different spinners.
function RouteFallback() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#030712]">
      <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
    </div>
  );
}


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
          {/* One Suspense boundary around the whole route table: a navigation
              swaps the entire page anyway, so a per-route boundary would add
              nesting without changing what the user sees. */}
          <Suspense fallback={<RouteFallback />}>
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
          </Suspense>
        </AppBootstrap>
      </BrowserRouter>
    </ThemeProvider>
  );
}