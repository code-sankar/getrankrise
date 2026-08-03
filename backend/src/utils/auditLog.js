// backend/src/utils/auditLog.js
export const AUDIT_EVENTS = Object.freeze({
  COMPETITOR_ADDED:   "competitor.added",
  COMPETITOR_UPDATED: "competitor.updated",
  COMPETITOR_REMOVED: "competitor.removed",
  COMPETITOR_SYNCED:  "competitor.synced",
  CLINIC_UPDATED:     "clinic.updated",
  SETTINGS_UPDATED:   "settings.updated",
  REVIEW_REPLIED:     "review.replied",
  CONNECTION_CREATED: "connection.created",
  CONNECTION_REMOVED: "connection.removed",
  CAMPAIGN_CREATED:   "campaign.created",
  CAMPAIGN_STARTED:   "campaign.started",
  CAMPAIGN_CANCELED:  "campaign.canceled",
});

// Auditing must never fail the request that triggered it.
export const auditFromReq = async (req, event, meta = {}) => {
  try {
    console.info("[audit]", JSON.stringify({
      event,
      at:       new Date().toISOString(),
      userId:   req.user?.id   ?? null,
      clinicId: req.clinic?.id ?? null,
      ip:       req.ip,
      meta,
    }));
  } catch (err) {
    console.warn("[audit] write failed:", err.message);
  }
};