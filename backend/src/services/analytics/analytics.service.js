// backend/src/services/analytics/analytics.service.js
//
// Server-side analytics aggregation. Replaces two things at once:
//   * the stub route that returned { data: null }
//   * ~200 lines of hardcoded rawReviews + client-side derive functions in
//     frontend/src/store/analyticsSlice.js — including deriveGrowthData's
//     hardcoded ["Oct".."Apr"] month list, which silently dropped any review
//     outside those seven literal months.
//
// Design rules:
//   * Aggregation happens in SQL. Shipping raw rows to the browser so it can
//     count them stops scaling at exactly the moment the product succeeds.
//   * The response shape is FINAL chart data. The frontend adds only
//     presentation (colors); it never re-derives numbers.
//   * Free tier: analytics are computed over the same window the review feed
//     shows — the most recent `storedReviewsLimit` rows. Otherwise the Free
//     dashboard would advertise stats about reviews the user cannot see,
//     which both leaks value and looks like a bug ("247 reviews? I see 20").
//   * All queries go through sequelize.query with $n binds on the single
//     shared pool (Phase 0 rule). `dialect: postgres` assumed — the interval
//     arithmetic and to_char formats are PG-specific on purpose.
//
// NULL handling (all verified against seeded data):
//   * review_date NULL → COALESCE to created_at everywhere, so hand-entered
//     or partially-synced rows still land in a bucket.
//   * sentiment NULL → COALESCE to the rating heuristic inline, so rows from
//     before migration 0005's backfill (or written by code that forgot to set
//     it) still contribute instead of dragging the average via exclusion.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { getSubscriptionState } from "../subscription/subscriptionState.service.js";
import { RATING_SENTIMENT_SQL } from "../../utils/sentiment.js";

// ── Range definitions ────────────────────────────────────────────────────────
// bucket: how growthData groups; label: to_char format for the bucket name.
const RANGES = {
  last_7_days: { interval: "7 days", bucket: "day", label: "Mon DD" },
  last_30_days: { interval: "30 days", bucket: "day", label: "Mon DD" },
  last_6_months: { interval: "6 months", bucket: "month", label: "Mon" },
  all_time: { interval: null, bucket: "month", label: "Mon YY" },
};

export const VALID_RANGES = Object.keys(RANGES);

// Effective timestamp of a review — single definition, used everywhere.
const TS = "COALESCE(r.review_date, r.created_at)";
// Effective sentiment — stored value or rating heuristic. See utils/sentiment.js.
const SENT = `COALESCE(r.sentiment, ${RATING_SENTIMENT_SQL("r.rating")})`;

/**
 * Builds the FROM/WHERE skeleton shared by every aggregate query.
 *
 * Free-tier cap: the base relation becomes "the N most recent reviews", and
 * the date-range filter applies ON TOP of that — matching what the review
 * feed's capStoredReviews() lets the user actually see.
 *
 * Returns { fromSql, binds } where binds[0] is always clinicId.
 */
function baseRelation({ clinicId, storedCap }) {
  if (storedCap != null) {
    return {
      fromSql: `(
        SELECT * FROM reviews
         WHERE clinic_id = $1
         ORDER BY COALESCE(review_date, created_at) DESC
         LIMIT ${Number(storedCap)}
      ) r`,
      binds: [clinicId],
    };
  }
  return { fromSql: `reviews r WHERE_MARK`, binds: [clinicId] };
}

// Assembles: SELECT ... FROM <base> WHERE <clinic if uncapped> AND <range>
function q({ select, groupOrder = "", range, base }) {
  const rangeCond = range.interval ? `AND ${TS} >= NOW() - INTERVAL '${range.interval}'` : "";
  // Capped base already filtered by clinic inside the subquery; uncapped needs it here.
  const from = base.fromSql.includes("WHERE_MARK")
    ? base.fromSql.replace("WHERE_MARK", "") + ` WHERE r.clinic_id = $1 ${rangeCond}`
    : base.fromSql + ` WHERE TRUE ${rangeCond}`;
  return `SELECT ${select} FROM ${from} ${groupOrder}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * The whole analytics payload for one clinic + range.
 * Shape mirrors what the frontend charts consume directly:
 * { summaryStats, growthData, ratingBreakdown, platformData, range, cappedByPlan }
 */
export async function getAnalytics(clinicId, rangeKey = "last_30_days") {
  const range = RANGES[rangeKey] || RANGES.last_30_days;

  const sub = await getSubscriptionState(clinicId);
  const capValue = sub.limits.storedReviewsLimit;
  const storedCap = Number.isFinite(capValue) ? capValue : null;

  const base = baseRelation({ clinicId, storedCap });

  const [summary, growth, ratings, platforms] = await Promise.all([
    summaryStats({ base, range, clinicId }),
    growthData({ base, range }),
    ratingBreakdown({ base, range }),
    platformData({ base, range }),
  ]);

  return {
    summaryStats: summary,
    growthData: growth,
    ratingBreakdown: ratings,
    platformData: platforms,
    range: RANGES[rangeKey] ? rangeKey : "last_30_days",
    cappedByPlan: storedCap != null,
  };
}

// ── Summary pills ────────────────────────────────────────────────────────────
//
// ⚠ EVERY NUMBER HERE IS RANGE-SCOPED. That is deliberate and correct for
// avgRating / responseRate / sentimentScore — "what is my rating in the last 30
// days" is the question the range selector asks.
//
// It was NOT correct for the count, because the frontend labelled it
// "Total Reviews" and the Analytics page rendered "All data calculated from N
// real reviews". With the default last_30_days range and a clinic whose reviews
// predate that window, the pill read 1 while the review feed and the competitor
// self-metrics both read 34 — three surfaces of the same app disagreeing about
// how many reviews exist, with no way for the user to tell which was lying.
//
// Both numbers are now returned. `totalReviews` keeps its range scope (renamed
// in the UI to "Reviews in Range"); `lifetimeReviews` counts the whole base
// relation and is what the feed shows — for a Free clinic that is the capped
// window, so the two surfaces still agree exactly.
async function summaryStats({ base, range, clinicId }) {
  const sql = q({
    base,
    range,
    select: `
      COUNT(*)::int                                            AS total_reviews,
      ROUND(AVG(r.rating)::numeric, 1)::float                  AS avg_rating,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.replied) / NULLIF(COUNT(*), 0))::int
                                                               AS response_rate,
      ROUND(AVG(${SENT}))::int                                 AS sentiment_score,
      COUNT(*) FILTER (WHERE ${TS} >= date_trunc('month', NOW()))::int
                                                               AS new_this_month,
      COUNT(*) FILTER (WHERE r.rating <= 2 AND NOT r.replied)::int
                                                               AS urgent_count
    `,
  });

  // Same base relation, no range filter — i.e. exactly the rows the review
  // feed can show. RANGES.all_time has interval:null, which is what makes q()
  // omit the range predicate.
  const lifetimeSql = q({
    base,
    range: RANGES.all_time,
    select: `COUNT(*)::int AS lifetime_reviews`,
  });

  const [[row], [lifetimeRow]] = await Promise.all([
    sequelize.query(sql, { bind: base.binds, type: QueryTypes.SELECT }),
    sequelize.query(lifetimeSql, { bind: base.binds, type: QueryTypes.SELECT }),
  ]);

  return {
    totalReviews: row?.total_reviews ?? 0,
    lifetimeReviews: lifetimeRow?.lifetime_reviews ?? 0,
    avgRating: row?.avg_rating ?? 0,
    responseRate: row?.response_rate ?? 0,
    sentimentScore: row?.sentiment_score ?? 0,
    newThisMonth: row?.new_this_month ?? 0,
    urgentCount: row?.urgent_count ?? 0,
    growth: await growthPercent(clinicId),
  };
}

/**
 * Month-over-month growth: reviews this calendar month vs last calendar month.
 * Deliberately range-independent — "are we growing" is one number regardless
 * of which chart window is selected, and computing it over the raw table (not
 * the capped base) is fine because it's a count of NEW arrivals, not a view of
 * stored history.
 */
async function growthPercent(clinicId) {
  const [row] = await sequelize.query(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(review_date, created_at) >= date_trunc('month', NOW()))::int AS cur,
       COUNT(*) FILTER (WHERE COALESCE(review_date, created_at) >= date_trunc('month', NOW()) - INTERVAL '1 month'
                          AND COALESCE(review_date, created_at) <  date_trunc('month', NOW()))::int AS prev
     FROM reviews WHERE clinic_id = $1`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );
  const cur = row?.cur ?? 0;
  const prev = row?.prev ?? 0;
  if (prev === 0) return 0; // no baseline → "Stable", not +∞%
  return Math.round(((cur - prev) / prev) * 100);
}

// ── Growth chart ─────────────────────────────────────────────────────────────
// One row per day/month bucket IN THE DATA. Buckets with zero reviews simply
// don't appear — recharts connects across them, and generating empty buckets
// for all_time could mean hundreds of zero rows. Key is named "month" because
// that's the dataKey the existing GrowthChart component reads; for day-
// bucketed ranges it carries "Jul 18"-style labels, which render identically.
async function growthData({ base, range }) {
  const sql = q({
    base,
    range,
    select: `
      to_char(date_trunc('${range.bucket}', ${TS}), '${range.label}') AS month,
      MIN(date_trunc('${range.bucket}', ${TS}))                       AS bucket_start,
      COUNT(*)::int                                                   AS reviews,
      COUNT(*) FILTER (WHERE r.replied)::int                          AS responses,
      ROUND(AVG(r.rating)::numeric, 2)::float                         AS "avgRating"
    `,
    groupOrder: `GROUP BY 1 ORDER BY bucket_start ASC`,
  });

  const rows = await sequelize.query(sql, { bind: base.binds, type: QueryTypes.SELECT });
  // bucket_start is ordering plumbing only — strip it.
  return rows.map(({ bucket_start, ...rest }) => rest);
}

// ── Rating distribution ──────────────────────────────────────────────────────
// Always returns all five stars (zero-filled) — a distribution chart with
// missing bars reads as a rendering bug. Colors are presentation and attach
// on the frontend.
async function ratingBreakdown({ base, range }) {
  const sql = q({
    base,
    range,
    select: `r.rating AS star, COUNT(*)::int AS count`,
    groupOrder: `GROUP BY r.rating`,
  });

  const rows = await sequelize.query(sql, { bind: base.binds, type: QueryTypes.SELECT });
  const byStar = Object.fromEntries(rows.map((r) => [r.star, r.count]));
  const total = rows.reduce((s, r) => s + r.count, 0);

  return [5, 4, 3, 2, 1].map((star) => ({
    star: `${star} ★`,
    count: byStar[star] ?? 0,
    percentage: total > 0 ? Math.round(((byStar[star] ?? 0) / total) * 100) : 0,
  }));
}

// ── Platform breakdown ───────────────────────────────────────────────────────
async function platformData({ base, range }) {
  const sql = q({
    base,
    range,
    select: `
      r.platform                                               AS name,
      COUNT(*)::int                                            AS value,
      ROUND(AVG(r.rating)::numeric, 1)::float                  AS "avgRating",
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.replied) / NULLIF(COUNT(*), 0))::int
                                                               AS "responseRate"
    `,
    groupOrder: `GROUP BY r.platform ORDER BY value DESC`,
  });

  return sequelize.query(sql, { bind: base.binds, type: QueryTypes.SELECT });
}

// ── CSV export ───────────────────────────────────────────────────────────────
/**
 * Raw rows for the range as a CSV string. Respects the same free-tier cap.
 * Excel-injection hardening: cells starting with = + - @ get a leading quote.
 */
export async function exportCsv(clinicId, rangeKey = "last_30_days") {
  const range = RANGES[rangeKey] || RANGES.last_30_days;
  const sub = await getSubscriptionState(clinicId);
  const capValue = sub.limits.storedReviewsLimit;
  const storedCap = Number.isFinite(capValue) ? capValue : null;
  const base = baseRelation({ clinicId, storedCap });

  const sql = q({
    base,
    range,
    select: `
      ${TS}            AS date,
      r.platform,
      r.reviewer_name  AS reviewer,
      r.rating,
      ${SENT}          AS sentiment,
      r.replied,
      r.review_text    AS review,
      r.reply_text     AS reply
    `,
    groupOrder: `ORDER BY 1 DESC`,
  });

  const rows = await sequelize.query(sql, { bind: base.binds, type: QueryTypes.SELECT });

  const esc = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v).replace(/"/g, '""');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };

  const header = "date,platform,reviewer,rating,sentiment,replied,review,reply";
  const lines = rows.map((r) =>
    [
      r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
      r.platform,
      r.reviewer,
      r.rating,
      r.sentiment,
      r.replied,
      r.review,
      r.reply,
    ]
      .map(esc)
      .join(",")
  );

  return [header, ...lines].join("\n");
}