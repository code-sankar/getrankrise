// backend/src/services/reviews/providers/mockReviews.provider.js
//
// Deterministic mock reviews so the ENTIRE pipeline — scheduler → claim →
// sync → upsert → sentiment → dashboard → analytics — runs today, before
// Google approves GBP API access (the Phase 1 approval gate, which takes
// days-to-weeks). Same philosophy as the competitor mock provider: seeded by
// location so every sync of the same location yields the same reviews, which
// exercises upsert dedupe for real.
//
// Two dynamic behaviours (deliberate, to exercise the merge rules):
//   * review m2 EDITS itself each day (text + rating flips 4↔2 on even/odd
//     day-of-year) → the rating-change sentiment recompute path runs
//   * review m3 gains a Google-side reply after the first sync of a UTC day
//     → the GBP-reply import path runs
//
// PRODUCTION GUARD: refuses to run when NODE_ENV=production unless
// REVIEWS_MOCK_ALLOW_PROD=true. Phase 7's scheduler starts claiming the
// moment isImplemented flips — a prod deploy with mock mode accidentally on
// must fail loudly, not silently fill real dashboards with fake patients.

import crypto from "node:crypto";

const NAMES = [
  "Asha Sharma", "Ravi Patel", "Mina Rao", "Joseph K", "Priya Nair",
  "Daniel Thomas", "Sunita Devi", "Arjun Mehta", "Grace L", "Vikram Singh",
  "Anita Kumari", "Rahul Verma", "Neha Gupta", "Thomas M", "Lakshmi P",
];

const TEXTS = [
  ["Excellent care, the doctor listened patiently and explained everything.", 5],
  ["Very clean clinic and friendly staff. Highly recommend.", 5],
  ["Good experience overall, slight wait but worth it.", 4],
  ["Doctor was great but the billing took too long.", 4],
  ["Average visit. Nothing special.", 3],
  ["Waited over an hour past my appointment time.", 2],
  ["Reception was rude and the process was confusing.", 2],
  ["Terrible experience, would not return.", 1],
  ["Best clinic in the area, my whole family comes here.", 5],
  ["Helpful staff, easy parking, quick appointment.", 4],
];

const hashInt = (s) => crypto.createHash("sha256").update(s).digest().readUInt32BE(0);

export async function fetchReviewsPage({ locationId, pageToken }) {
  if (process.env.NODE_ENV === "production" && process.env.REVIEWS_MOCK_ALLOW_PROD !== "true") {
    const err = new Error(
      "Mock review provider invoked in production. Set REVIEWS_MOCK=false (and complete GBP approval) or explicitly allow with REVIEWS_MOCK_ALLOW_PROD=true."
    );
    err.code = "MOCK_IN_PROD";
    throw err;
  }

  const seed = hashInt(String(locationId || "loc"));
  const count = 22 + (seed % 14); // 22–35 reviews per location, stable
  const page = Number(pageToken || 0);
  const per = 15;
  const start = page * per;
  const end = Math.min(start + per, count);

  const dayOfYear = Math.floor(
    (Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400e3
  );

  const reviews = [];
  for (let i = start; i < end; i++) {
    const h = hashInt(`${seed}:${i}`);
    const [text, rating] = TEXTS[h % TEXTS.length];
    const daysAgo = 2 + (h % 400); // spread over ~13 months
    const createTime = new Date(Date.now() - daysAgo * 86400e3).toISOString();

    const r = {
      externalId: `mock-${seed}-${i}`,
      reviewerName: NAMES[h % NAMES.length],
      rating,
      text,
      createTime,
      updateTime: createTime,
      replied: h % 4 === 0, // ~25% already replied on Google
      replyText: h % 4 === 0 ? "Thank you for your feedback — we appreciate you!" : null,
    };

    // Dynamic edit: exercises rating-change → sentiment recompute
    if (i === 2) {
      r.rating = dayOfYear % 2 === 0 ? 4 : 2;
      r.text = `Updated my review on day ${dayOfYear}: ${r.rating >= 4 ? "issues resolved, much better now." : "second visit was disappointing."}`;
      r.updateTime = new Date().toISOString();
    }
    // Dynamic reply arrival: exercises GBP-reply import
    if (i === 3) {
      r.replied = true;
      r.replyText = `Thanks for visiting us! (auto-reply logged ${new Date().toISOString().slice(0, 10)})`;
      r.updateTime = new Date().toISOString();
    }

    reviews.push(r);
  }

  return {
    reviews,
    nextPageToken: end < count ? String(page + 1) : null,
    totalReviewCount: count,
  };
}