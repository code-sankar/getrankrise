// frontend/src/components/account/VerifyEmailBanner.test.jsx
//
// A real component rendered into a real DOM — the class of test that was
// impossible before Vitest, because this file's import graph reaches
// axios.helper.js and therefore import.meta.env.
//
// The behaviour worth pinning is the ABSENCE case. This banner's job is to be
// invisible for the overwhelming majority of users, and the failure mode
// nobody would notice in review is a version that flashes on every cold load
// for people who verified months ago.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../../store/authSlice.js";

const resendVerification = vi.fn();
vi.mock("../../api/accountAPI.js", () => ({
  accountAPI: { resendVerification: (...a) => resendVerification(...a) },
  messageFrom: (err, fallback) => err?.response?.data?.message || fallback,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("react-toastify", () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

const VerifyEmailBanner = (await import("./VerifyEmailBanner.jsx")).default;

/**
 * Renders the banner with the auth slice in an exact state.
 *
 * preloadedState rather than dispatching loginSuccess, deliberately. Both auth
 * reducers coalesce with `?? null`, so a payload carrying `emailVerifiedAt:
 * undefined` comes out of them as `null` — which means the not-yet-known case
 * is UNREACHABLE through a dispatch and a test that went that way would be
 * silently asserting the null branch twice. The component still handles
 * undefined defensively (a future reducer, or a different mount path, can
 * produce it), so the test injects it directly.
 */
function renderWith(user) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        token: user ? "t" : null,
        user: user ?? null,
        clinicName: user?.clinicName ?? null,
        clinicRole: null,
        userEmail: user?.email ?? null,
        isAuthenticated: Boolean(user),
        bootstrapped: true,
        loading: false,
        error: null,
      },
    },
  });
  return render(
    <Provider store={store}>
      <VerifyEmailBanner />
    </Provider>
  );
}

const UNVERIFIED = {
  id: "u1",
  name: "Dr Owner",
  email: "owner@example.com",
  role: "admin",
  clinicName: "Clinic",
  emailVerifiedAt: null,
};
const VERIFIED = { ...UNVERIFIED, emailVerifiedAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => {
  resendVerification.mockReset().mockResolvedValue({ message: "Sent." });
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("when it should be invisible", () => {
  test("renders nothing for a verified user", () => {
    const { container } = renderWith(VERIFIED);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when there is no user at all", () => {
    const { container } = renderWith(null);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing while emailVerifiedAt is still UNKNOWN", () => {
    // The subtle one. Before /auth/me answers, the field is undefined rather
    // than null — and treating undefined as "unverified" would flash this
    // banner at every already-verified user on every cold load. Unknown must
    // read as verified.
    const { container } = renderWith({ ...UNVERIFIED, emailVerifiedAt: undefined });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("when there is something to do", () => {
  test("shows for an unverified user and names the address", () => {
    renderWith(UNVERIFIED);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/confirm your email to start sending/i)).toBeInTheDocument();
    expect(screen.getByText(/owner@example\.com/)).toBeInTheDocument();
  });

  test("resending calls the API and confirms", async () => {
    const user = userEvent.setup();
    renderWith(UNVERIFIED);

    await user.click(screen.getByRole("button", { name: /resend link/i }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalled();
    // The label changes so a second click reads as deliberate rather than as
    // "did the first one work?".
    expect(await screen.findByRole("button", { name: /send again/i })).toBeInTheDocument();
  });

  test("a failed resend surfaces the server's reason and stays actionable", async () => {
    resendVerification.mockRejectedValue({
      response: { data: { message: "We can't send confirmation emails right now." } },
    });
    const user = userEvent.setup();
    renderWith(UNVERIFIED);

    await user.click(screen.getByRole("button", { name: /resend link/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "We can't send confirmation emails right now."
      )
    );
    // Still offering the action — a transient failure must not dead-end.
    expect(screen.getByRole("button", { name: /resend link/i })).toBeEnabled();
  });

  test("the button is disabled while the request is in flight", async () => {
    let release;
    resendVerification.mockImplementation(
      () => new Promise((r) => { release = () => r({ message: "ok" }); })
    );
    const user = userEvent.setup();
    renderWith(UNVERIFIED);

    await user.click(screen.getByRole("button", { name: /resend link/i }));
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();

    release();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  test("dismissing hides it for this render only", async () => {
    // Deliberately not persisted: sending stays blocked until verification, so
    // a permanent dismiss would move the confusion to the moment it costs them.
    const user = userEvent.setup();
    const { container } = renderWith(UNVERIFIED);

    await user.click(screen.getByRole("button", { name: /hide until next page load/i }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
