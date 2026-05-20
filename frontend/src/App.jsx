import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SendRequests from "./pages/SendRequests.jsx";
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
// Reads isAuthenticated directly from Redux store — no more localStorage checks
function PrivateRoute({ children }) {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/send-requests"
            element={
              <PrivateRoute>
                <SendRequests />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <Settings />
              </PrivateRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <PrivateRoute>
                <Analytics />
              </PrivateRoute>
            }
          />
          <Route
            path="/competitors"
            element={
              <PrivateRoute>
                <Competitors />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminProfile />
              </PrivateRoute>
            }
          />
          <Route
            path="/terms"
            element={
              <PrivateRoute>
                <TermsAndConditions />
              </PrivateRoute>
            }
          />
          <Route
            path="/privacy"
            element={
              <PrivateRoute>
                <PrivacyPolicy />
              </PrivateRoute>
            }
          />
          <Route
            path="/help"
            element={
              <PrivateRoute>
                <HelpCenter />
              </PrivateRoute>
            }
          />
          <Route
            path="/contact"
            element={
              <PrivateRoute>
                <ContactUs />
              </PrivateRoute>
            }
          />
          <Route
            path="/faq"
            element={
              <PrivateRoute>
                <FAQ />
              </PrivateRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}