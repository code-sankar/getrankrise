/**
 * Pins the request shape of POST /reviews/sync.
 *
 * ── THE BUG THIS CATCHES ────────────────────────────────────────────────────
 * syncReviewsNow used to call:
 *
 *     axiosInstance.post("/reviews/sync", null, { timeout: LONG_TIMEOUT })
 *
 * Axios serialises a `null` body to the four-character string "null" and still
 * sends Content-Type: application/json. express.json() on the other end parses
 * that, gets a JSON null where it expects an object, and rejects the request:
 *
 *     400  Unexpected token 'n', "null" is not valid JSON
 *
 * So every click of "Sync now" 400'd before it ever reached the controller.
 * Nothing in the UI said so in a way anyone would decode — the button spun,
 * a generic "Could not sync reviews" toast appeared, and the review list
 * stayed empty. It looked like "there are no new reviews", which is exactly
 * what a working sync looks like on a quiet day.
 *
 * The distinction this test defends is narrow and easy to undo: `undefined`
 * sends no body at all, `null` sends the string "null". They read as
 * interchangeable and are not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const post = vi.fn();
vi.mock("../utils/axios.helper.js", () => ({
  default: { post: (...a) => post(...a) },
  LONG_TIMEOUT: 60000,
}));

const { syncReviewsNow } = await import("./reviews.hook.js");

describe("syncReviewsNow request shape", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { message: "Synced", data: { created: 3 } } });
  });
  afterEach(() => vi.clearAllMocks());

  it("posts to /reviews/sync", async () => {
    await syncReviewsNow();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/reviews/sync");
  });

  it("sends NO body — never null, which axios serialises to the string 'null'", async () => {
    await syncReviewsNow();
    const body = post.mock.calls[0][1];
    expect(body).toBeUndefined();
    // Stated separately from the undefined check: this is the assertion that
    // actually encodes the bug, and it should survive a rewrite of the line
    // above. `null` is the value that produced the 400.
    expect(body).not.toBeNull();
  });

  it("keeps the long timeout — provider pagination outlives the 10s default", async () => {
    await syncReviewsNow();
    expect(post.mock.calls[0][2]).toMatchObject({ timeout: 60000 });
  });

  it("returns the unwrapped data envelope", async () => {
    await expect(syncReviewsNow()).resolves.toEqual({ created: 3 });
  });

  it("rethrows so the button can clear its spinner", async () => {
    post.mockRejectedValue({ response: { status: 500, data: {} } });
    await expect(syncReviewsNow()).rejects.toBeDefined();
  });
});
