// backend/src/controllers/campaign.controller.js
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { Campaign, CampaignRecipient } from "../models/index.js";
import {
  createCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  recordOptOut,
} from "../services/campaigns/campaign.service.js";
import { getCreditSummary } from "../services/credits/credits.service.js";
import { normalizePhone, CALLING_CODES } from "../utils/csv.js";
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../utils/apiResponse.js";
import { auditFromReq, AUDIT_EVENTS } from "../utils/auditLog.js";

// ── POST /api/v1/campaigns ───────────────────────────────────────────────────
// Body: { name, channel, messageTemplate, csvText, scheduledAt?, throttlePerMinute? }
// csvText travels as a JSON string field — 2000 recipients ≈ 80KB, inside the
// body limit; no multipart plumbing needed.
export const create = async (req, res) => {
  try {
    const { name, channel, messageTemplate, csvText, scheduledAt, throttlePerMinute } = req.body;

    const result = await createCampaign({
      clinic: req.clinic,
      subscription: req.subscription, // set by requireFeature on the route
      name,
      channel,
      messageTemplate,
      csvText,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      throttlePerMinute,
    });

    // Warn (don't block) when recipients outnumber remaining credits — the
    // runner pauses gracefully at the wall, but the user should see it coming.
    const credits = await getCreditSummary(req.clinic.id);
    const channelKey = channel === "WhatsApp" ? "whatsapp" : "sms";
    const remaining = credits?.[channelKey]?.remaining ?? 0;

    auditFromReq(req, AUDIT_EVENTS.SETTINGS_UPDATED, {
      metadata: { section: "campaigns", action: "created", campaignId: result.campaign.id },
    });

    return createdResponse(
      res,
      {
        campaign: result.campaign,
        imported: result.imported,
        suppressedAtImport: result.suppressedAtImport,
        invalidCount: result.invalidCount,
        invalidSample: result.invalid,
        creditsEstimate: result.creditsEstimate,
        creditsRemaining: remaining,
        creditWarning:
          result.creditsEstimate > remaining
            ? `This campaign needs ~${result.creditsEstimate} credits but you have ${remaining} left this period. It will pause when credits run out.`
            : null,
      },
      "Campaign created"
    );
  } catch (err) {
    if (err.code === "UPGRADE_REQUIRED") {
      return res.status(403).json({
        success: false,
        code: "UPGRADE_REQUIRED",
        message: err.message,
        currentPlan: req.subscription?.plan,
        requiredPlans: err.requiredPlans || ["premium"],
      });
    }
    if (err.code === "EMPTY_IMPORT" || err.code === "TOO_MANY_RECIPIENTS") {
      return res.status(400).json({
        success: false,
        message: err.message,
        invalidSample: err.invalid || [],
      });
    }
    console.error("createCampaign error:", err);
    return serverErrorResponse(res, "Could not create campaign");
  }
};

// ── GET /api/v1/campaigns ────────────────────────────────────────────────────
export const list = async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({
      where: { clinicId: req.clinic.id },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    return successResponse(res, { message: "Campaigns fetched", data: { campaigns } });
  } catch (err) {
    console.error("listCampaigns error:", err);
    return serverErrorResponse(res);
  }
};

// ── GET /api/v1/campaigns/:id ────────────────────────────────────────────────
export const getOne = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.id, clinicId: req.clinic.id },
    });
    if (!campaign) return notFoundResponse(res, "Campaign not found");

    const breakdown = await sequelize.query(
      `SELECT status, COUNT(*)::int AS count
         FROM campaign_recipients WHERE campaign_id = $1::uuid GROUP BY status`,
      { bind: [campaign.id], type: QueryTypes.SELECT }
    );

    const recipients = await CampaignRecipient.findAll({
      where: { campaignId: campaign.id },
      order: [["createdAt", "ASC"]],
      limit: 200,
      attributes: ["id", "name", "phone", "status", "error", "sentAt"],
    });

    return successResponse(res, {
      message: "Campaign fetched",
      data: { campaign, breakdown, recipients },
    });
  } catch (err) {
    console.error("getCampaign error:", err);
    return serverErrorResponse(res);
  }
};

// ── Lifecycle endpoints ──────────────────────────────────────────────────────
const lifecycle = (fn, verb) => async (req, res) => {
  try {
    const ok = await fn(req.params.id, req.clinic.id);
    if (!ok) {
      return badRequestResponse(
        res,
        `Campaign cannot be ${verb} from its current state (or was not found).`
      );
    }
    const campaign = await Campaign.findByPk(req.params.id);
    return successResponse(res, { message: `Campaign ${verb}`, data: campaign });
  } catch (err) {
    console.error(`${verb} campaign error:`, err);
    return serverErrorResponse(res);
  }
};

export const start = lifecycle(startCampaign, "started");
export const pause = lifecycle(pauseCampaign, "paused");
export const resume = lifecycle(resumeCampaign, "resumed");
export const cancel = lifecycle(cancelCampaign, "canceled");

// ── POST /api/v1/campaigns/opt-outs ──────────────────────────────────────────
// Manual clinic-scoped suppression ("this patient asked us not to text them").
export const addOptOut = async (req, res) => {
  try {
    const cc = CALLING_CODES[String(req.clinic.countryCode || "").toUpperCase()] || "";
    const phone = normalizePhone(req.body.phone, cc);
    if (!phone) return badRequestResponse(res, "Invalid phone number");

    await recordOptOut({ clinicId: req.clinic.id, phone, source: "manual" });
    return successResponse(res, { message: "Number opted out", data: { phone } });
  } catch (err) {
    console.error("addOptOut error:", err);
    return serverErrorResponse(res);
  }
};