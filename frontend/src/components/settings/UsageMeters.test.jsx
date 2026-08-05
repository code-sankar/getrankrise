// frontend/src/components/settings/UsageMeters.test.jsx
//
// The usage API uses `limit: null` for "unlimited on this plan" and `limit: 0`
// for "not included on this plan". Those are opposite meanings that both fail
// a naive truthiness check, and collapsing them would tell a Premium customer
// their unlimited feature was exhausted. That distinction is the main thing
// worth a test here.
//
// Also the reason this component exists at all: GET /api/v1/usage had been
// complete and mounted for phases with no caller, so a user could only discover
// a cap by hitting it mid-task.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
vi.mock("../../utils/axios.helper.js", () => ({
  default: { get: (...a) => get(...a) },
}));

const UsageMeters = (await import("./UsageMeters.jsx")).default;

const respond = (metrics) =>
  get.mockResolvedValue({ data: { data: { plan: "starter", status: "active", metrics } } });

// One meter (review_sync) is deliberately exhausted so the "limit reached"
// copy has a home. Tests that assert on the ABSENCE of that copy must use
// HEADROOM instead — a document-wide queryByText would otherwise match this
// row and pass or fail for the wrong reason.
const FULL = {
  ai_reply: { period: "month", used: 12, limit: 200, remaining: 188 },
  email: { period: "month", used: 40, limit: 500, remaining: 460 },
  review_sync: { period: "day", used: 6, limit: 6, remaining: 0 },
  competitor_sync: { period: "day", used: 0, limit: 10, remaining: 10 },
};

/** Same shape, nothing exhausted. */
const HEADROOM = {
  ...FULL,
  review_sync: { period: "day", used: 1, limit: 6, remaining: 5 },
};

beforeEach(() => get.mockReset());

test("shows a loading skeleton before the response lands", () => {
  get.mockReturnValue(new Promise(() => {})); // never resolves
  render(<UsageMeters dark />);
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});

test("renders every metric with its used / limit", async () => {
  respond(FULL);
  render(<UsageMeters dark />);

  expect(await screen.findByText("AI reply drafts")).toBeInTheDocument();
  expect(screen.getByText("Review request emails")).toBeInTheDocument();
  expect(screen.getByText("Manual review syncs")).toBeInTheDocument();
  expect(screen.getByText("Competitor refreshes")).toBeInTheDocument();

  expect(screen.getByText("12 / 200 per month")).toBeInTheDocument();
  expect(screen.getByText("0 / 10 per day")).toBeInTheDocument();
});

test("an exhausted daily meter says when it resets", async () => {
  respond(FULL); // review_sync is 6/6
  render(<UsageMeters dark />);
  expect(await screen.findByText(/Limit reached — resets tomorrow/)).toBeInTheDocument();
});

test("an exhausted monthly meter resets next month, not tomorrow", async () => {
  respond({ ...FULL, ai_reply: { period: "month", used: 200, limit: 200, remaining: 0 } });
  render(<UsageMeters dark />);
  expect(await screen.findByText(/Limit reached — resets next month/)).toBeInTheDocument();
});

// ── The distinction that matters ────────────────────────────────────────────

test("limit: null reads as UNLIMITED, not as exhausted", async () => {
  respond({ ...HEADROOM, ai_reply: { period: "month", used: 4820, limit: null, remaining: null } });
  render(<UsageMeters dark />);

  expect(await screen.findByText("4,820 used · unlimited")).toBeInTheDocument();
  // The failure this guards: an unlimited meter must never say "limit reached".
  expect(screen.queryByText(/Limit reached/)).not.toBeInTheDocument();
});

test("limit: 0 reads as NOT INCLUDED, not as 0 / 0", async () => {
  respond({ ...HEADROOM, ai_reply: { period: "month", used: 0, limit: 0, remaining: 0 } });
  render(<UsageMeters dark />);

  expect(await screen.findByText("Not included on your plan")).toBeInTheDocument();
  expect(screen.queryByText("0 / 0 per month")).not.toBeInTheDocument();
  // used >= limit is true for 0 >= 0, so this is exactly where a naive
  // comparison would wrongly claim the limit was reached.
  expect(screen.queryByText(/Limit reached/)).not.toBeInTheDocument();
});

test("large numbers are grouped for readability", async () => {
  respond({ ...FULL, email: { period: "month", used: 1234, limit: 5000, remaining: 3766 } });
  render(<UsageMeters dark />);
  expect(await screen.findByText("1,234 / 5,000 per month")).toBeInTheDocument();
});

// ── Failure and emptiness ───────────────────────────────────────────────────

test("a failed fetch shows the server's message, not a blank panel", async () => {
  get.mockRejectedValue({ response: { data: { message: "Subscription not found" } } });
  render(<UsageMeters dark />);
  expect(await screen.findByText("Subscription not found")).toBeInTheDocument();
});

test("a fetch failure with no message still says something", async () => {
  get.mockRejectedValue(new Error("network"));
  render(<UsageMeters dark />);
  expect(await screen.findByText(/Couldn't load your usage/)).toBeInTheDocument();
});

test("no metrics at all is an explicit empty state", async () => {
  respond({});
  render(<UsageMeters dark />);
  expect(await screen.findByText(/No metered features on your plan yet/)).toBeInTheDocument();
});

test("metrics render in a fixed order regardless of response key order", async () => {
  // Object key order from the server must not be able to reshuffle the UI.
  respond({
    competitor_sync: FULL.competitor_sync,
    email: FULL.email,
    ai_reply: FULL.ai_reply,
    review_sync: FULL.review_sync,
  });
  render(<UsageMeters dark />);

  await screen.findByText("AI reply drafts");
  const labels = [...document.querySelectorAll("div > div > span:first-child")]
    .map((n) => n.textContent)
    .filter((t) => t && !t.includes("/") && !t.includes("used"));

  expect(labels.slice(0, 4)).toEqual([
    "AI reply drafts",
    "Review request emails",
    "Manual review syncs",
    "Competitor refreshes",
  ]);
});

describe("cleanup", () => {
  test("a response landing after unmount does not warn", async () => {
    let resolve;
    get.mockReturnValue(new Promise((r) => { resolve = r; }));
    const errors = [];
    vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a.join(" ")));

    const { unmount } = render(<UsageMeters dark />);
    unmount();
    resolve({ data: { data: { metrics: FULL } } });
    await waitFor(() => expect(get).toHaveBeenCalled());

    expect(errors.filter((e) => /unmounted/i.test(e))).toHaveLength(0);
  });
});
