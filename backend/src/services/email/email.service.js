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
        name: process.env.SENDGRID_FROM_NAME || clinicName || "Kirtify",
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

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT MAIL — password reset, email verification, team invitations
// ═══════════════════════════════════════════════════════════════════════════
//
// Different in kind from the review-request mail above, and the differences
// matter:
//
//   * NOT METERED. emailPerMonth caps outbound review requests, which are the
//     product's paid output. Charging a clinic's quota to let them reset their
//     own password would mean the account they cannot get into is also the
//     thing rate-limiting their way back in. These bypass usage_counters
//     entirely; abuse is bounded by the per-route rate limiters instead.
//
//   * NOT OPTIONAL. A review request that fails to send is a lost opportunity.
//     A reset link that fails to send is a locked-out customer, so these
//     THROW rather than degrade, and every caller decides what the user sees.
//
//   * NO OPT-OUT FOOTER. Transactional account mail the recipient explicitly
//     asked for (or was invited to) is outside CAN-SPAM's commercial-message
//     definition; an unsubscribe link on a password reset would be actively
//     wrong — nobody should be able to opt out of account recovery.

/** Shared chrome so account mail is visually one family. */
function accountEmail({ heading, intro, buttonLabel, url, footnote, expiryNote }) {
  const safeUrl = escapeHtml(url);

  const text =
    `${heading}\n\n${intro}\n\n${url}\n\n` +
    (expiryNote ? `${expiryNote}\n\n` : "") +
    (footnote || "");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
              max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6">
    <p style="font-size:20px;font-weight:700;margin:0 0 16px">${escapeHtml(heading)}</p>
    <p style="font-size:16px;margin:0 0 24px">${escapeHtml(intro)}</p>
    <p style="margin:0 0 24px">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;
         background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;
         font-weight:600;font-size:15px">${escapeHtml(buttonLabel)}</a>
    </p>
    <p style="font-size:13px;color:#64748b;margin:0 0 8px">
      Or paste this link into your browser:<br>
      <a href="${safeUrl}" style="color:#4f46e5;word-break:break-all">${safeUrl}</a>
    </p>
    ${expiryNote ? `<p style="font-size:13px;color:#64748b">${escapeHtml(expiryNote)}</p>` : ""}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0" />
    <p style="font-size:12px;color:#94a3b8">${escapeHtml(footnote || "")}</p>
  </div>`;

  return { text, html };
}

/**
 * Low-level sender for account mail.
 *
 * Deliberately NOT reusing sendReviewRequestEmail: that function's `from.name`
 * falls back to the clinic name, which would put a clinic's branding on a
 * Kirtify password reset. Account mail is always from the platform.
 */
async function sendAccountEmail({ to, subject, text, html }) {
  if (!to) {
    const err = new Error("Recipient email is required");
    err.code = "EMAIL_SEND";
    throw err;
  }

  if (simulate()) {
    // The URL is logged on purpose. Without it there is no way to complete a
    // reset, verification or invite flow on a dev box with no SendGrid key,
    // which would make all three untestable locally. simulate() is false in
    // production (and env.js refuses to boot with EMAIL_SIMULATE=true there),
    // so this cannot leak a live token.
    const url = String(text).match(/https?:\/\/\S+/)?.[0] ?? "(no link)";
    console.log(`[email] SIMULATED → ${to} · "${subject}"\n         link: ${url}`);
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
        // Always the platform — never the clinic. See sendAccountEmail's note.
        name: process.env.SENDGRID_FROM_NAME || "Kirtify",
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

/**
 * "Reset your password" — the link is a bearer credential for full account
 * takeover, so the copy says plainly what to do if it was not requested.
 */
export async function sendPasswordResetEmail({ to, name, resetUrl, expiryMinutes }) {
  const { text, html } = accountEmail({
    heading: "Reset your password",
    intro: `Hi ${name || "there"}, we received a request to reset the password for your Kirtify account. Click below to choose a new one.`,
    buttonLabel: "Choose a new password",
    url: resetUrl,
    expiryNote: `This link expires in ${expiryMinutes} minutes and can only be used once.`,
    footnote:
      "If you didn't request this, you can ignore this email — your password will not change. " +
      "Requesting a new link immediately invalidates this one.",
  });

  return sendAccountEmail({ to, subject: "Reset your Kirtify password", text, html });
}

/** "Confirm your email" — sent at signup and on demand from Settings. */
export async function sendEmailVerificationEmail({ to, name, verifyUrl, expiryHours }) {
  const { text, html } = accountEmail({
    heading: "Confirm your email address",
    intro: `Welcome to Kirtify, ${name || "there"}. Confirm this address so we can send you urgent review alerts and billing notices — and so you can start sending review requests.`,
    buttonLabel: "Confirm my email",
    url: verifyUrl,
    expiryNote: `This link expires in ${expiryHours} hours.`,
    footnote: "If you didn't create a Kirtify account, you can safely ignore this email.",
  });

  return sendAccountEmail({ to, subject: "Confirm your Kirtify email", text, html });
}

/**
 * "You've been invited" — the one piece of account mail whose recipient may
 * have no account at all, so the copy has to work for both cases.
 */
export async function sendClinicInviteEmail({
  to,
  clinicName,
  inviterName,
  role,
  acceptUrl,
  expiryDays,
}) {
  const clinic = clinicName || "a clinic";
  const who = inviterName ? `${inviterName} has` : "You have been";
  const roleLine =
    role === "owner"
      ? "You'll have full access, including billing."
      : "You'll be able to manage reviews, replies, review requests and campaigns — everything except billing.";

  const { text, html } = accountEmail({
    heading: `Join ${clinic} on Kirtify`,
    intro: `${who} invited you to join ${clinic} on Kirtify as ${role === "owner" ? "an owner" : "a team member"}. ${roleLine}`,
    buttonLabel: "Accept invitation",
    url: acceptUrl,
    expiryNote: `This invitation expires in ${expiryDays} days.`,
    footnote:
      "If you weren't expecting this, you can ignore it — nothing happens until you accept.",
  });

  return sendAccountEmail({
    to,
    subject: `${inviterName || "Someone"} invited you to ${clinic} on Kirtify`,
    text,
    html,
  });
}