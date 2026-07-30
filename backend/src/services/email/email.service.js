// backend/src/services/email/email.service.js
//
// Transactional review-request email via SendGrid (v3 REST, fetch-based — no
// SDK dependency, same posture as paddle.client.js and the SMS providers).
//
// This powers the Email / Both options on POST /api/v1/requests. Email is a
// SINGLE-SEND transactional channel (a post-visit review ask), NOT a campaign
// channel — Pulse Campaigns stay SMS/WhatsApp only (CAMPAIGN_CHANNELS). That
// keeps the compliance surface small: one message triggered by a real visit,
// with an honest sender identity and opt-out line, rather than bulk marketing.
//
// Metering, plan caps (emailPerMonth 0/500/5000), and the reserve→send→refund
// flow already live in request.controller.js — this module is only the "send"
// step the controller was scaffolded to call.
//
// Config (add to .env):
//   SENDGRID_API_KEY     required to actually send
//   SENDGRID_FROM_EMAIL  required — a VERIFIED sender/domain in SendGrid
//                        (SendGrid rejects mail from unverified addresses)
//   SENDGRID_FROM_NAME   optional — defaults to the clinic name per-send
//   EMAIL_SIMULATE=true  dev only — pretend-send (logs, no API call) so the
//                        Email/Both flow is testable without a key, exactly
//                        like the SMS providers' simulate path.
//
// COMPLIANCE NOTE: this is fine for low-volume, visit-triggered transactional
// mail. If email ever becomes bulk/recurring, add a real one-click unsubscribe
// (List-Unsubscribe header + suppression) and a postal address to satisfy
// CAN-SPAM/GDPR — same way SMS already appends STOP for TCPA/TRAI.

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

const simulate = () =>
  process.env.EMAIL_SIMULATE === "true" && process.env.NODE_ENV !== "production";

/**
 * True when email can actually be sent (real key + verified sender) OR is being
 * simulated in dev. request.controller.js's 503 gate reads THIS — email stays
 * honestly unavailable until configured.
 */
export function isEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) || simulate();
}

async function throwForSendgridError(res, what) {
  if (res.ok) return; // 202 Accepted, empty body
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.errors?.map((e) => e.message).join("; ") || "";
  } catch {
    detail = await res.text().catch(() => "");
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`SendGrid rejected the API key during ${what} (${res.status}).`);
    err.code = "EMAIL_AUTH";
    throw err;
  }
  const err = new Error(`SendGrid ${what} failed (${res.status}): ${String(detail).slice(0, 300)}`);
  err.code = "EMAIL_SEND";
  throw err;
}

const escapeHtml = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function buildEmail({ patientName, clinicName, reviewLink, body }) {
  const clinic = clinicName || "our clinic";
  const subject = `How was your visit to ${clinic}?`;
  const hello = patientName ? `Hi ${patientName},` : "Hi,";

  // Plain text mirrors the SMS body the controller already rendered, so the two
  // channels read consistently, plus an honest footer.
  const text =
    `${hello}\n\n${body}\n\n` +
    `You're receiving this because you recently visited ${clinic}. ` +
    `If you'd rather not get these, just reply and let us know.`;

  const link = reviewLink || "";
  const button = link
    ? `<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;` +
      `background:#0891b2;color:#ffffff;text-decoration:none;border-radius:8px;` +
      `font-weight:600;font-size:15px">Leave a review</a>`
    : "";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
              max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6">
    <p style="font-size:16px">${escapeHtml(hello)}</p>
    <p style="font-size:16px">Thanks for visiting <strong>${escapeHtml(clinic)}</strong>!
       If you have a moment, we'd love to hear how it went.</p>
    ${button ? `<p style="margin:24px 0">${button}</p>` : ""}
    ${
      link
        ? `<p style="font-size:13px;color:#64748b">Or paste this link into your browser:
       <br><a href="${escapeHtml(link)}" style="color:#0891b2">${escapeHtml(link)}</a></p>`
        : ""
    }
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0" />
    <p style="font-size:12px;color:#94a3b8">
      You're receiving this because you recently visited ${escapeHtml(clinic)}.
      If you'd rather not receive these, simply reply and let us know.
    </p>
  </div>`;

  return { subject, text, html };
}

/**
 * Send a single review-request email.
 * @returns {Promise<{ provider:"sendgrid", simulated:boolean }>}
 * @throws  err.code "EMAIL_NOT_CONFIGURED" | "EMAIL_AUTH" | "EMAIL_SEND"
 */
export async function sendReviewRequestEmail({ to, patientName, clinicName, reviewLink, body }) {
  if (!to) {
    const err = new Error("Recipient email is required");
    err.code = "EMAIL_SEND";
    throw err;
  }

  const { subject, text, html } = buildEmail({ patientName, clinicName, reviewLink, body });

  if (simulate()) {
    console.log(`[email] SIMULATED → ${to} · "${subject}"`);
    return { provider: "sendgrid", simulated: true };
  }

  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    const err = new Error("SendGrid is not configured");
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }

  const res = await fetch(SENDGRID_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: process.env.SENDGRID_FROM_NAME || clinicName || "GetRankRise",
      },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  await throwForSendgridError(res, "send");
  return { provider: "sendgrid", simulated: false };
}