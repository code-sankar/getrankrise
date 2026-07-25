// backend/src/services/campaigns/campaign.service.js
//
// Campaign lifecycle EXCEPT the send loop (that's campaignRunner.service.js).
// Creation, CSV import, pause/resume/cancel, and the opt-out helpers shared
// with the inbound-STOP webhook.

import { QueryTypes, Op } from "sequelize";
import { sequelize } from "../../config/db.js";
import { Campaign, CampaignRecipient, OptOut } from "../../models/index.js";
import { parseRecipientsCsv } from "../../utils/csv.js";
import { getLimitsFor } from "../../config/plans.js";

const MAX_RECIPIENTS = 2000; // per campaign — sanity bound, not a plan limit

// ── Opt-out primitives ───────────────────────────────────────────────────────

/**
 * Set of opted-out phones from `phones` for this clinic — clinic-scoped rows
 * OR global rows both suppress. One query however many phones.
 */
export async function optedOutSet(clinicId, phones) {
  if (phones.length === 0) return new Set();
  const rows = await sequelize.query(
    `SELECT DISTINCT phone FROM opt_outs
      WHERE phone = ANY($2::text[])
        AND (clinic_id = $1::uuid OR clinic_id IS NULL)`,
    { bind: [clinicId, phones], type: QueryTypes.SELECT }
  );
  return new Set(rows.map((r) => r.phone));
}

/**
 * Idempotent insert honouring the partial unique indexes — Model.create would
 * throw on the second STOP from the same phone; this shrugs.
 */
export async function recordOptOut({ clinicId = null, phone, channel = null, source }) {
  await sequelize.query(
    `INSERT INTO opt_outs (clinic_id, phone, channel, source)
     VALUES ($1::uuid, $2::text, $3::text, $4::text)
     ON CONFLICT DO NOTHING`,
    { bind: [clinicId, phone, channel, source], type: QueryTypes.INSERT }
  );
}

// ── Creation ─────────────────────────────────────────────────────────────────

/**
 * Creates a campaign + its recipient rows from CSV text, atomically.
 *
 * Plan gates the CALLER must have already passed: requireFeature
 * ("pulseCampaignsEnabled") on the route. This function adds the one gate the
 * middleware can't express: WhatsApp campaigns need whatsAppPerMonth > 0
 * (Starter has SMS but zero WhatsApp).
 *
 * Opt-outs are marked at import time (rows land as skipped_opt_out so the
 * user sees WHY the count dropped) AND re-checked at send time by the runner
 * (someone can STOP between scheduling and sending).
 *
 * Credits are NOT reserved here — they're consumed per-send by the runner.
 * We return an estimate so the UI can warn "230 recipients, 180 SMS credits
 * left" before the user commits.
 */
export async function createCampaign({
  clinic,
  subscription, // req.subscription from requireFeature
  name,
  channel,
  messageTemplate,
  csvText,
  scheduledAt = null,
  throttlePerMinute = 10,
}) {
  const limits = subscription?.limits ?? getLimitsFor(clinic.plan);

  if (channel === "WhatsApp" && !(limits.whatsAppPerMonth > 0)) {
    const err = new Error("WhatsApp campaigns are not included in your plan.");
    err.code = "UPGRADE_REQUIRED";
    err.requiredPlans = ["premium"];
    throw err;
  }

  const { recipients, invalid } = parseRecipientsCsv(csvText, {
    countryCode: clinic.countryCode,
  });

  if (recipients.length === 0) {
    const err = new Error(
      invalid.length
        ? `No valid recipients found (${invalid.length} invalid rows).`
        : "The CSV contained no recipients."
    );
    err.code = "EMPTY_IMPORT";
    err.invalid = invalid.slice(0, 20);
    throw err;
  }
  if (recipients.length > MAX_RECIPIENTS) {
    const err = new Error(`Campaigns are limited to ${MAX_RECIPIENTS} recipients per import.`);
    err.code = "TOO_MANY_RECIPIENTS";
    throw err;
  }

  const suppressed = await optedOutSet(clinic.id, recipients.map((r) => r.phone));

  const campaign = await sequelize.transaction(async (transaction) => {
    const c = await Campaign.create(
      {
        clinicId: clinic.id,
        name,
        channel,
        messageTemplate,
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
        throttlePerMinute,
        totalRecipients: recipients.length,
        skippedCount: [...suppressed].length
          ? recipients.filter((r) => suppressed.has(r.phone)).length
          : 0,
      },
      { transaction }
    );

    await CampaignRecipient.bulkCreate(
      recipients.map((r) => ({
        campaignId: c.id,
        clinicId: clinic.id,
        name: r.name,
        phone: r.phone,
        status: suppressed.has(r.phone) ? "skipped_opt_out" : "pending",
      })),
      { transaction }
    );

    return c;
  });

  return {
    campaign,
    imported: recipients.length,
    suppressedAtImport: campaign.skippedCount,
    invalid: invalid.slice(0, 20),
    invalidCount: invalid.length,
    creditsEstimate: recipients.length - campaign.skippedCount,
  };
}

// ── Lifecycle transitions ────────────────────────────────────────────────────
// Every transition is a guarded single UPDATE (status IN (...) in the WHERE),
// so two racing admins can't, say, resume a campaign that just completed —
// same exactly-one-winner property the runner's promotion uses.

const transition = async (id, clinicId, from, to, extra = {}) => {
  const [count] = await Campaign.update(
    { status: to, ...extra },
    { where: { id, clinicId, status: { [Op.in]: from } } }
  );
  return count === 1;
};

export const startCampaign = (id, clinicId) =>
  transition(id, clinicId, ["draft", "scheduled"], "running", { startedAt: new Date() });

export const pauseCampaign = (id, clinicId) =>
  transition(id, clinicId, ["running", "scheduled"], "paused");

export const resumeCampaign = (id, clinicId) =>
  transition(id, clinicId, ["paused"], "running", { lastError: null });

/**
 * Cancel also drains the queue: pending rows flip to a terminal skip so the
 * runner has nothing to claim and the progress numbers stay truthful.
 */
export async function cancelCampaign(id, clinicId) {
  return sequelize.transaction(async (transaction) => {
    const ok = await Campaign.update(
      { status: "canceled", completedAt: new Date() },
      {
        where: { id, clinicId, status: { [Op.in]: ["draft", "scheduled", "running", "paused"] } },
        transaction,
      }
    ).then(([n]) => n === 1);
    if (!ok) return false;

    await sequelize.query(
      `UPDATE campaign_recipients
          SET status = 'failed', error = 'Campaign canceled'
        WHERE campaign_id = $1::uuid AND status IN ('pending','processing')`,
      { bind: [id], type: QueryTypes.UPDATE, transaction }
    );
    return true;
  });
}