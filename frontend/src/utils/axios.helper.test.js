// frontend/src/utils/axios.helper.test.js
//
// The response interceptor is the single most behaviour-carrying file in the
// frontend: it decides when a session is silently refreshed, when a user is
// thrown to /login, and which of three different 403s opens the upgrade modal.
//
// None of it was testable before Vitest, for a specific reason — this module
// reads `import.meta.env` at module scope and throws outside a Vite build. So
// the file that decides whether users stay logged in had zero coverage, and
// the only way to check a change to it was to click through the app.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";

vi.mock("react-toastify", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const dispatch = vi.fn();
vi.mock("../store/store.js", () => ({
  default: { dispatch: (...a) => dispatch(...a) },
}));

const { toast } = await import("react-toastify");
const axiosInstance = (await import("./axios.helper.js")).default;
const { isProtectedPath } = await import("./axios.helper.js");

let mock;
beforeEach(() => {
  mock = new MockAdapter(axiosInstance);
  dispatch.mockClear();
  localStorage.clear();
  // A successful refresh pins the new token onto the INSTANCE DEFAULTS, which
  // is module-level state that outlives a test. Harmless in a browser (a
  // refresh only ever happens when a session exists) but it leaks between
  // tests here, so the header-attachment assertions below start from a clean
  // instance rather than inheriting the previous test's token.
  delete axiosInstance.defaults.headers.common.Authorization;
});
afterEach(() => mock.restore());

// ── The redirect rule (P2-5) ────────────────────────────────────────────────

describe("isProtectedPath", () => {
  test("public routes are not protected", () => {
    for (const p of [
      "/",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/accept-invite",
      "/terms",
      "/privacy",
      "/help",
      "/contact",
      "/faq",
    ]) {
      expect(isProtectedPath(p), `${p} should be public`).toBe(false);
    }
  });

  test("app routes are protected", () => {
    for (const p of ["/dashboard", "/settings", "/campaigns", "/analytics", "/admin"]) {
      expect(isProtectedPath(p), `${p} should be protected`).toBe(true);
    }
  });

  test("a trailing slash does not turn a public route protected", () => {
    // "/login/" reaching the protected branch would bounce a user off the very
    // page they were sent to.
    expect(isProtectedPath("/login/")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });

  test("an unknown route is treated as protected", () => {
    // Fail closed. A new PUBLIC page missing from the list is a visible
    // annoyance; a new PROTECTED page missing from it would strand someone on
    // a screen that cannot load with no way to sign in.
    expect(isProtectedPath("/some-future-page")).toBe(true);
  });
});

describe("401 handling", () => {
  test("a hard 401 on a PROTECTED route clears the token and redirects", async () => {
    window.location.pathname = "/dashboard";
    localStorage.setItem("token", "stale");
    mock.onGet("/reviews").reply(401, { message: "Invalid token" });

    await expect(axiosInstance.get("/reviews")).rejects.toBeTruthy();

    expect(localStorage.getItem("token")).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  test("a hard 401 on a PUBLIC route clears the token but does NOT redirect", async () => {
    // The regression: a visitor reading the privacy policy with a stale token
    // was thrown to a login screen they never asked for, by a background
    // request they never made.
    window.location.pathname = "/privacy";
    window.location.href = "http://localhost:3000/privacy";
    localStorage.setItem("token", "stale");
    mock.onGet("/plans").reply(401, { message: "Invalid token" });

    await expect(axiosInstance.get("/plans")).rejects.toBeTruthy();

    expect(localStorage.getItem("token")).toBeNull();
    expect(window.location.href).toBe("http://localhost:3000/privacy");
  });

  test("an expired token is refreshed once and the request retried", async () => {
    window.location.pathname = "/dashboard";
    localStorage.setItem("token", "expired");

    let attempts = 0;
    mock.onGet("/reviews").reply((config) => {
      attempts += 1;
      if (attempts === 1) return [401, { message: "TokenExpiredError" }];
      // The retry must carry the NEW token. Sending the expired one again is
      // how a refresh loop starts.
      expect(config.headers.Authorization).toBe("Bearer fresh");
      return [200, { success: true, data: { reviews: [] } }];
    });

    // refreshAccessToken deliberately uses a BARE axios (not axiosInstance) so
    // the refresh cannot recurse through this interceptor — which also means
    // MockAdapter never sees it. Spy on the module default instead.
    const refresh = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { data: { accessToken: "fresh" } } });

    const res = await axiosInstance.get("/reviews");

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
    expect(res.data.success).toBe(true);
    expect(localStorage.getItem("token")).toBe("fresh");
  });

  test("N concurrent 401s share ONE refresh", async () => {
    // The backend ROTATES on every refresh, so N parallel refreshes means the
    // first response invalidates the rest and the user is logged out
    // mid-session for no reason. That is what the single-flight promise in
    // refreshAccessToken exists to prevent, and it had no test.
    window.location.pathname = "/dashboard";
    localStorage.setItem("token", "expired");

    const seen = { reviews: 0, requests: 0, analytics: 0 };
    for (const path of ["reviews", "requests", "analytics"]) {
      mock.onGet(`/${path}`).reply(() => {
        seen[path] += 1;
        return seen[path] === 1
          ? [401, { message: "TokenExpiredError" }]
          : [200, { success: true }];
      });
    }

    const refresh = vi.spyOn(axios, "post").mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: { data: { accessToken: "fresh" } } }), 10)
        )
    );

    await Promise.all([
      axiosInstance.get("/reviews"),
      axiosInstance.get("/requests"),
      axiosInstance.get("/analytics"),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("a failed refresh signs the user out rather than retrying forever", async () => {
    window.location.pathname = "/dashboard";
    localStorage.setItem("token", "expired");
    localStorage.setItem("clinicName", "Clinic A");

    let attempts = 0;
    mock.onGet("/reviews").reply(() => {
      attempts += 1;
      return [401, { message: "TokenExpiredError" }];
    });

    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh rejected"));
    // The interceptor logs this path; keep the suite output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(axiosInstance.get("/reviews")).rejects.toBeTruthy();

    expect(attempts).toBe(1);
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("clinicName")).toBeNull();
    expect(window.location.href).toBe("/login");
  });
});

// ── The three 403s ──────────────────────────────────────────────────────────

describe("403 handling", () => {
  test("UPGRADE_REQUIRED opens the modal and does not toast", async () => {
    mock.onPost("/reviews/x/ai-reply").reply(403, {
      code: "UPGRADE_REQUIRED",
      currentPlan: "free",
      requiredPlans: ["starter", "premium"],
      message: "Upgrade to unlock",
    });

    await expect(axiosInstance.post("/reviews/x/ai-reply")).rejects.toBeTruthy();

    expect(dispatch).toHaveBeenCalledTimes(1);
    // A modal AND a toast is two interruptions for one event.
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("QUOTA_EXCEEDED on an upgradable plan opens the modal", async () => {
    mock.onPost("/reviews/sync").reply(403, {
      code: "QUOTA_EXCEEDED",
      currentPlan: "starter",
      requiredPlans: ["premium"],
      message: "You've used all 6 review syncs for this day",
    });

    await expect(axiosInstance.post("/reviews/sync")).rejects.toBeTruthy();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test("QUOTA_EXCEEDED on the TOP plan toasts the server's message instead", async () => {
    // A modal whose only offer is the plan they already own is worse than
    // useless — and the server's sentence names the limit and when it resets.
    mock.onPost("/reviews/sync").reply(403, {
      code: "QUOTA_EXCEEDED",
      currentPlan: "premium",
      requiredPlans: ["premium"],
      message: "You've used all 48 review syncs for this day",
    });

    await expect(axiosInstance.post("/reviews/sync")).rejects.toBeTruthy();

    expect(dispatch).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      "You've used all 48 review syncs for this day"
    );
  });

  test("a plain permission failure shows the server's own message", async () => {
    mock.onPost("/billing/create-checkout").reply(403, {
      code: "INSUFFICIENT_ROLE",
      message: "Only the clinic owner can do this. Ask them to make the change.",
    });

    await expect(axiosInstance.post("/billing/create-checkout")).rejects.toBeTruthy();

    expect(dispatch).not.toHaveBeenCalled();
    // Not the generic "Access denied." — the server wrote something actionable.
    expect(toast.error).toHaveBeenCalledWith(
      "Only the clinic owner can do this. Ask them to make the change."
    );
  });

  test("EMAIL_NOT_VERIFIED does not open the upgrade modal", async () => {
    // It is not a plan gap, and offering to sell someone a plan when the fix is
    // "click the link in your inbox" is the wrong conversation.
    mock.onPost("/requests").reply(403, {
      code: "EMAIL_NOT_VERIFIED",
      message: "Please confirm your email address before sending messages.",
    });

    await expect(axiosInstance.post("/requests")).rejects.toBeTruthy();

    expect(dispatch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Please confirm your email address before sending messages."
    );
  });
});

// ── Everything else ─────────────────────────────────────────────────────────

describe("other statuses", () => {
  test("404 is left entirely to the caller", async () => {
    mock.onGet("/subscription/credits").reply(404, { message: "No subscription" });
    await expect(axiosInstance.get("/subscription/credits")).rejects.toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("a 500 toasts once and rejects", async () => {
    mock.onGet("/reviews").reply(500, { message: "Internal server error" });
    await expect(axiosInstance.get("/reviews")).rejects.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("Server error. Please try again later.");
  });

  test("a network error with no response is reported as one", async () => {
    mock.onGet("/reviews").networkError();
    await expect(axiosInstance.get("/reviews")).rejects.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      "Network error. Please check your connection."
    );
  });

  test("the token is attached to every outgoing request", async () => {
    localStorage.setItem("token", "abc123");
    mock.onGet("/reviews").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer abc123");
      return [200, { success: true }];
    });
    await axiosInstance.get("/reviews");
  });

  test("no token means no Authorization header, not 'Bearer null'", async () => {
    mock.onGet("/plans").reply((config) => {
      expect(config.headers.Authorization).toBeUndefined();
      return [200, { success: true }];
    });
    await axiosInstance.get("/plans");
  });
});
