import { Op } from "sequelize";
import {
  Competitor,
  CompetitorSnapshot,
  Review,
} from "../models/index.js";
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  badRequestResponse,
  forbiddenResponse,
  conflictResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { getLimitsFor } from "../config/plans.js";
import {
  syncCompetitor,
  competitorDataIsSimulated,
} from "../services/competitor/competitor.service.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

// ── Helper: the clinic's own metrics, for side-by-side comparison ─────────────
// Computed from the clinic's stored reviews so "you vs them" uses the same
// definitions the rest of the app uses (see reviewsSlice.selectReviewStats).
const buildSelfMetrics = async (clinicId) => {
  const reviews = await Review.findAll({
    where:      { clinicId },
    attributes: ["rating", "replied"],
    raw:        true,
  });

  const total = reviews.length;
  if (total === 0) {
    return { name: "You", rating: 0, totalReviews: 0, responseRate: 0, sentiment: 0 };
  }

  const replied   = reviews.filter((r) => r.replied).length;
  const positive  = reviews.filter((r) => r.rating >= 4).length;
  const ratingSum = reviews.reduce((s, r) => s + r.rating, 0);

  return {
    name:         "You",
    rating:       Math.round((ratingSum / total) * 10) / 10,
    totalReviews: total,
    responseRate: Math.round((replied / total) * 100),
    sentiment:    Math.round((positive / total) * 100),
  };
};

// ── GET /api/v1/competitors ───────────────────────────────────────────────────
// Table data: all of the clinic's competitors with cached latest metrics.
// Query: ?includeInactive=true to also return paused competitors.
export const listCompetitors = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const where = { clinicId: req.clinic.id };
    if (!includeInactive) where.isActive = true;

    const competitors = await Competitor.findAll({
      where,
      order: [["createdAt", "ASC"]],
    });

    const limits      = getLimitsFor(req.clinic.plan);
    const activeCount = competitors.filter((c) => c.isActive).length;

    return successResponse(res, {
      message: "Competitors fetched",
      data: {
        competitors,
        usage: {
          tracked: activeCount,
          limit:   limits.competitorLimit,
          canAdd:  activeCount < limits.competitorLimit,
        },
      },
    });
  } catch (err) {
    console.error("listCompetitors error:", err);
    return serverErrorResponse(res);
  }
};

// ── GET /api/v1/competitors/overview ──────────────────────────────────────────
// Everything the comparison dashboard needs in one call: the clinic's own
// metrics plus every active competitor's cached metrics.
export const getOverview = async (req, res) => {
  try {
    const [self, competitors] = await Promise.all([
      buildSelfMetrics(req.clinic.id),
      Competitor.findAll({
        where: { clinicId: req.clinic.id, isActive: true },
        order: [["createdAt", "ASC"]],
      }),
    ]);

    return successResponse(res, {
      message: "Overview fetched",
      data: {
        self,
        // Honesty flag. With no APIFY/DATAFORSEO credentials the tracker serves
        // deterministic fixture data, and every field below looks exactly like a
        // real measurement. The client needs to be able to say so.
        simulated: competitorDataIsSimulated(),
        competitors: competitors.map((c) => ({
          id:           c.id,
          name:         c.name,
          platform:     c.platform,
          rating:       c.latestRating ?? 0,
          totalReviews: c.latestTotalReviews ?? 0,
          responseRate: c.latestResponseRate ?? 0,
          sentiment:    c.latestSentiment ?? 0,
          newThisMonth: c.newReviewsThisPeriod ?? 0,
          lastSyncedAt: c.lastSyncedAt,
          syncStatus:   c.syncStatus,
        })),
      },
    });
  } catch (err) {
    console.error("getOverview error:", err);
    return serverErrorResponse(res);
  }
};

// ── GET /api/v1/competitors/:id ───────────────────────────────────────────────
// Single competitor + its snapshot trend. Query: ?days=30 (default 30, max 365)
export const getCompetitor = async (req, res) => {
  try {
    const { id } = req.params;
    const days   = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

    // Ownership: scope by clinicId, not just id
    const competitor = await Competitor.findOne({
      where: { id, clinicId: req.clinic.id },
    });
    if (!competitor) return notFoundResponse(res, "Competitor not found");

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const snapshots = await CompetitorSnapshot.findAll({
      where: { competitorId: competitor.id, capturedAt: { [Op.gte]: since } },
      order: [["capturedAt", "ASC"]],
      attributes: [
        "rating", "totalReviews", "newReviews",
        "ratingDelta", "responseRate", "sentiment", "capturedAt",
      ],
    });

    return successResponse(res, {
      message: "Competitor fetched",
      data:    { competitor, snapshots },
    });
  } catch (err) {
    console.error("getCompetitor error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/competitors ──────────────────────────────────────────────────
// Adds a competitor, enforcing the plan's competitorLimit, then kicks off an
// initial sync so the row shows real metrics immediately.
export const addCompetitor = async (req, res) => {
  try {
   const limits = req.subscription?.limits ?? getLimitsFor(req.clinic.plan);

    // ── Plan count cap ─────────────────────────────────────────────────────
    // requireFeature("competitorTracking") on the route already blocks Free.
    // Here we separate Starter (3) from Premium (10).
    const activeCount = await Competitor.count({
      where: { clinicId: req.clinic.id, isActive: true },
    });
    if (activeCount >= limits.competitorLimit) {
      return forbiddenResponse(
        res,
        `Your ${limits.label} plan tracks up to ${limits.competitorLimit} competitors. ` +
        `Upgrade to track more.`
      );
    }

    const { name, platform, externalId, profileUrl, location } = req.body;

    const competitor = await Competitor.create({
      clinicId: req.clinic.id,
      name,
      platform,
      externalId: externalId || null,
      profileUrl: profileUrl || null,
      location:   location   || null,
    });

    // Initial sync — best effort. If the provider fails we still return the
    // created row (marked syncStatus="failed") so the user can retry/refresh.
    try {
      await syncCompetitor(competitor);
      await competitor.reload();
    } catch (syncErr) {
      console.warn("Initial competitor sync failed:", syncErr.message);
    }

    auditFromReq(req, AUDIT_EVENTS.COMPETITOR_ADDED, {
      metadata: { competitorId: competitor.id, name: competitor.name, platform: competitor.platform },
    });

    return createdResponse(res, competitor, "Competitor added");
  } catch (err) {
    // Unique partial index (clinic_id, external_id, platform)
    if (err.name === "SequelizeUniqueConstraintError") {
      return conflictResponse(res, "You are already tracking this competitor");
    }
    console.error("addCompetitor error:", err);
    return serverErrorResponse(res);
  }
};

// ── PATCH /api/v1/competitors/:id ─────────────────────────────────────────────
// Whitelisted fields only — never let the client write cached metrics or sync
// bookkeeping. Re-activating a paused competitor re-checks the plan cap.
export const updateCompetitor = async (req, res) => {
  try {
    const { id } = req.params;

    const competitor = await Competitor.findOne({
      where: { id, clinicId: req.clinic.id },
    });
    if (!competitor) return notFoundResponse(res, "Competitor not found");

    // Guard: turning a paused competitor back on must respect the plan cap
    if (req.body.isActive === true && competitor.isActive === false) {
      const limits = getLimitsFor(req.clinic.plan);
      const activeCount = await Competitor.count({
        where: { clinicId: req.clinic.id, isActive: true },
      });
      if (activeCount >= limits.competitorLimit) {
        return forbiddenResponse(
          res,
          `Your ${limits.label} plan tracks up to ${limits.competitorLimit} competitors.`
        );
      }
    }

    const allowed = ["name", "location", "profileUrl", "isActive"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return successResponse(res, { message: "No changes to apply", data: competitor });
    }

    await competitor.update(updates);

    auditFromReq(req, AUDIT_EVENTS.COMPETITOR_UPDATED, {
      metadata: { competitorId: competitor.id, changedFields: Object.keys(updates) },
    });

    return successResponse(res, { message: "Competitor updated", data: competitor });
  } catch (err) {
    console.error("updateCompetitor error:", err);
    return serverErrorResponse(res);
  }
};

// ── DELETE /api/v1/competitors/:id ────────────────────────────────────────────
// Hard delete. Snapshots cascade (onDelete: CASCADE in associations).
export const deleteCompetitor = async (req, res) => {
  try {
    const { id } = req.params;

    const competitor = await Competitor.findOne({
      where: { id, clinicId: req.clinic.id },
    });
    if (!competitor) return notFoundResponse(res, "Competitor not found");

    await competitor.destroy();

    auditFromReq(req, AUDIT_EVENTS.COMPETITOR_REMOVED, {
      metadata: { competitorId: id, name: competitor.name },
    });

    return successResponse(res, { message: "Competitor removed", data: { id } });
  } catch (err) {
    console.error("deleteCompetitor error:", err);
    return serverErrorResponse(res);
  }
};

// ── POST /api/v1/competitors/:id/refresh ──────────────────────────────────────
// Manual re-sync. Rate-limited at the route level (scrapes are expensive).
export const refreshCompetitor = async (req, res) => {
  try {
    const { id } = req.params;

    const competitor = await Competitor.findOne({
      where: { id, clinicId: req.clinic.id },
    });
    if (!competitor) return notFoundResponse(res, "Competitor not found");
    if (!competitor.isActive) {
      return badRequestResponse(res, "Cannot refresh a paused competitor");
    }

    try {
      const snapshot = await syncCompetitor(competitor);
      await competitor.reload();

      auditFromReq(req, AUDIT_EVENTS.COMPETITOR_SYNCED, {
        metadata: { competitorId: competitor.id, totalReviews: snapshot.totalReviews },
      });

      return successResponse(res, {
        message: "Competitor synced",
        data:    { competitor, snapshot },
      });
    } catch (syncErr) {
      await competitor.reload();
      return successResponse(res, {
        message: "Sync failed — provider unavailable. Showing last known data.",
        data:    { competitor, snapshot: null, error: true },
      });
    }
  } catch (err) {
    console.error("refreshCompetitor error:", err);
    return serverErrorResponse(res);
  }
};