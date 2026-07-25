// backend/src/services/reviews/selfMetrics.service.js
//
// The clinic's OWN metrics in the same shape as a competitor snapshot —
// closing the Phase 4 flag: "you compute sentiment for competitors but never
// for yourself" is now fully dead. The competitor comparison table can show
// you-vs-them from the SAME formulas over real synced reviews.
//
// Wire-up (hand-edit, pattern only — I haven't seen buildSelfMetrics' full
// body): in competitor.controller.js, replace the body of buildSelfMetrics
// (or its placeholder values) with:
//
//     import { computeSelfMetrics } from "../services/reviews/selfMetrics.service.js";
//     ...
//     const self = await computeSelfMetrics(req.clinic.id);
//
// Shape matches CompetitorSnapshot: { rating, reviewCount, responseRate,
// sentiment } — all zeros/nulls degrade gracefully when no reviews exist yet.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { RATING_SENTIMENT_SQL } from "../../utils/sentiment.js";

export async function computeSelfMetrics(clinicId) {
  const [row] = await sequelize.query(
    `SELECT
       COUNT(*)::int                                        AS review_count,
       ROUND(AVG(r.rating)::numeric, 1)::float              AS rating,
       ROUND(100.0 * COUNT(*) FILTER (WHERE r.replied)
             / NULLIF(COUNT(*), 0))::int                    AS response_rate,
       ROUND(AVG(COALESCE(r.sentiment,
             ${RATING_SENTIMENT_SQL("r.rating")})))::int    AS sentiment
     FROM reviews r
     WHERE r.clinic_id = $1::uuid`,
    { bind: [clinicId], type: QueryTypes.SELECT }
  );

  return {
    rating: row?.rating ?? null,
    reviewCount: row?.review_count ?? 0,
    responseRate: row?.response_rate ?? 0,
    sentiment: row?.sentiment ?? null,
  };
}