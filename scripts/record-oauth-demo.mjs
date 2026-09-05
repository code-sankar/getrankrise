#!/usr/bin/env node
/**
 * record-oauth-demo.mjs — records the Google OAuth verification demo video.
 *
 * Google requires a screen recording of the consent flow before it will grant
 * the restricted `business.manage` scope. docs/google-api-application/
 * 02-oauth-verification.md is the shot list; this script performs it.
 *
 * ── TWO MODES ───────────────────────────────────────────────────────────────
 *
 * REFERENCE MODE (default) — runs against localhost with mock discovery and
 * mock reviews. It stubs the Google consent screen with a placeholder card,
 * writes the connection row the real callback would have written, and burns a
 * red "not for submission" banner into every frame. Use it to rehearse the
 * narration, check the pacing, and confirm the flow still works after a change.
 * The output is NOT submittable and is watermarked so it cannot be mistaken
 * for the real thing.
 *
 * LIVE MODE (DEMO_LIVE=1) — runs against a deployed instance with real Google
 * credentials. No stub, no database writes, no watermark. At the consent step
 * it hands the browser to you: sign in and grant consent on camera, and the
 * script resumes when Google redirects back. This produces the single
 * continuous take Google asks for.
 *
 * Live mode needs a display, so run it on your own machine, not on a server:
 *
 *   DEMO_LIVE=1 \
 *   DEMO_BASE_URL=https://app.kirtify.com \
 *   DEMO_EMAIL=you@example.com DEMO_PASSWORD=... \
 *   node scripts/record-oauth-demo.mjs
 *
 * ── WHAT THIS CANNOT DO ─────────────────────────────────────────────────────
 * It cannot record the consent screen for you in reference mode. Reaching it
 * needs a Google Cloud OAuth client, a Google account, and the app on its
 * deployed domain — and Google blocks automated browsers from signing in. That
 * is the whole reason live mode pauses for a human instead of driving it.
 *
 * ── OUTPUT ──────────────────────────────────────────────────────────────────
 * A .webm in DEMO_OUT (default ./demo-video). YouTube accepts WebM directly;
 * upload it unlisted, not private — a reviewer cannot request access to a
 * private video.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const LIVE = process.env.DEMO_LIVE === "1";
const APP = (process.env.DEMO_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const EMAIL = process.env.DEMO_EMAIL || "demo@kirtify.com";
const PASSWORD = process.env.DEMO_PASSWORD || "Demo1234!";
const OUT = process.env.DEMO_OUT || "./demo-video";
const DB = process.env.DEMO_DB || "kirtify_demo";
const W = 1600, H = 900;

mkdirSync(OUT, { recursive: true });

/** Reference mode only: stand in for what the real Google callback writes. */
const sql = (q) => {
  if (LIVE) return;
  execFileSync("psql", ["-h", "127.0.0.1", "-U", "postgres", "-d", DB, "-c", q], {
    env: { PGPASSWORD: "postgres", ...process.env },
    encoding: "utf8",
  });
};

// Injected into every document. Reference mode gets the warning banner; both
// modes get the caption bar, which doubles as a teleprompter — the italic line
// is what you say over that shot.
const overlay = (live) => `
(() => {
  const LIVE = ${live ? "true" : "false"};
  const build = () => {
    if (document.getElementById("__kf_cap")) return;
    const css = document.createElement("style");
    css.textContent = \`
      #__kf_wm, #__kf_cap { position: fixed; z-index: 2147483647;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        pointer-events: none; }
      #__kf_wm { top: 0; left: 0; right: 0; background: #7f1d1d; color: #fff;
        font-size: 12px; font-weight: 700; letter-spacing: .09em; text-align: center;
        padding: 6px 10px; text-transform: uppercase; }
      #__kf_cap { left: 0; right: 0; bottom: 0; background: rgba(2,4,10,.94);
        color: #e2e8f0; padding: 16px 28px 18px; border-top: 2px solid #0891b2;
        display: none; gap: 18px; align-items: flex-start; }
      #__kf_cap .n { color: #22d3ee; font-weight: 800; font-size: 26px;
        line-height: 1; min-width: 46px; font-variant-numeric: tabular-nums; }
      #__kf_cap .t { font-weight: 700; font-size: 16px; color: #fff;
        margin-bottom: 5px; letter-spacing: -0.01em; }
      #__kf_cap .s { font-size: 14px; color: #94a3b8; font-style: italic;
        line-height: 1.45; max-width: 1180px; }
      \${LIVE ? "" : "body { padding-top: 26px !important; }"}
      #root, main { padding-bottom: 104px !important; }
    \`;
    document.head.appendChild(css);
    if (!LIVE) {
      const wm = document.createElement("div");
      wm.id = "__kf_wm";
      wm.textContent = "Reference cut \\u2014 localhost, mock data, consent screen not included \\u2014 not for Google submission";
      document.body.appendChild(wm);
    }
    const cap = document.createElement("div");
    cap.id = "__kf_cap";
    cap.innerHTML = '<div class="n"></div><div><div class="t"></div><div class="s"></div></div>';
    document.body.appendChild(cap);
  };
  window.__kf_set = (c) => {
    const el = document.getElementById("__kf_cap");
    if (!el) return false;
    if (!c) { el.style.display = "none"; return true; }
    el.style.display = "flex";
    el.querySelector(".n").textContent = c.n;
    el.querySelector(".t").textContent = c.title;
    el.querySelector(".s").textContent = c.say ? "\\u201C" + c.say + "\\u201D" : "";
    return true;
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", build);
  else build();
})();
`;

const browser = await chromium.launch({
  headless: !LIVE,
  executablePath: process.env.DEMO_CHROME || undefined,
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  deviceScaleFactor: 1,
});
await ctx.addInitScript(overlay(LIVE));

if (!LIVE) {
  await ctx.route(/accounts\.google\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><meta charset="utf-8"><style>
        html,body{margin:0;height:100%;background:#f1f3f4;
          font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;
          display:flex;align-items:center;justify-content:center}
        .c{background:#fff;border:2px dashed #c0392b;border-radius:14px;
          max-width:760px;padding:44px 48px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
        h1{margin:0 0 6px;font-size:22px;color:#c0392b;letter-spacing:-.01em}
        h2{margin:0 0 22px;font-size:13px;color:#5f6368;font-weight:600;
          text-transform:uppercase;letter-spacing:.1em}
        p{margin:0 0 14px;font-size:15px;line-height:1.65;color:#202124}
        code{background:#f1f3f4;padding:2px 7px;border-radius:5px;
          font-size:13.5px;color:#c0392b;font-family:ui-monospace,monospace}
        ul{margin:6px 0 0;padding-left:22px;font-size:14.5px;line-height:1.85;color:#3c4043}
      </style><div class="c">
        <h1>The real Google consent screen belongs here</h1>
        <h2>Scene 3 &middot; 30 seconds &middot; must be recorded by a human</h2>
        <p>This frame cannot be automated. Reaching the real consent screen needs a
        Google Cloud OAuth client, a Google account to sign in with, and the app
        served from its deployed domain &mdash; and Google blocks automated
        browsers from signing in.</p>
        <p>Re-run this script with <code>DEMO_LIVE=1</code> and it will hand you the
        browser here. What must play, unedited:</p>
        <ul>
          <li>Google sign-in with the account that manages the Business Profile</li>
          <li>The consent screen naming <code>business.manage</code>, matching what you declared</li>
          <li>Clicking <b>Allow</b>, and the redirect back to your app</li>
        </ul>
      </div>`,
    })
  );
}

const page = await ctx.newPage();

// The caption lives in the page, and every navigation destroys it. Keeping the
// current one here and re-applying it after each goto is what stops scene 7
// from playing over a blank bar — the first cut of this video had a four-second
// hole for exactly that reason.
let caption = null;
const say = async (n, title, s) => {
  caption = n ? { n, title, say: s } : null;
  await page.evaluate((c) => window.__kf_set(c), caption).catch(() => {});
};
const go = async (url) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.evaluate((c) => window.__kf_set(c), caption).catch(() => {});
};
const wait = (ms) => page.waitForTimeout(ms);

if (!LIVE) sql("DELETE FROM reviews; DELETE FROM platform_connections;");

// ── Sign in (not part of the shot list) ─────────────────────────────────────
await go(`${APP}/login`);
await page.fill("input[type=email]", EMAIL);
await page.fill("input[type=password]", PASSWORD);
await page.click("button[type=submit]");
await wait(3500);

// ── 1 · The app before connecting ───────────────────────────────────────────
await go(`${APP}/settings`);
await page.getByRole("button", { name: "Integrations" }).click();
await wait(1500);
await say("01", "The app before connecting",
  "Kirtify is a reputation-management platform. Right now this clinic has no review source connected.");
await wait(9000);

// ── 2 · Start the connection ────────────────────────────────────────────────
await say("02", "Starting the OAuth flow",
  "This starts an OAuth flow requesting the business.manage scope, which is what lets the business reply to its own reviews.");
await wait(3500);
await page.getByRole("button", { name: /Connect Google Business Profile/i }).click();
await wait(6000);

// ── 3 · The Google consent screen ───────────────────────────────────────────
if (LIVE) {
  // Hand the browser to a human. Google refuses automated sign-in, so this is
  // the one scene that cannot be driven — and it is the scene reviewers watch
  // most closely, so it must play unedited anyway.
  console.log("\n▶ Complete the Google consent flow in the browser window.");
  console.log("  Recording continues; the script resumes on redirect back.\n");
  await page.waitForURL((u) => u.href.startsWith(APP), { timeout: 300_000 });
  await wait(2000);
} else {
  await say("03", "The real Google consent screen",
    "Record this scene yourself, unedited: sign in, the consent screen naming business.manage, then Allow.");
  await wait(17000);
  // What the real callback does: store the grant as pending_location and
  // redirect to /settings?google=connected.
  sql(`INSERT INTO platform_connections (clinic_id, platform, status, connected_email, connected_at)
       SELECT id,'google','pending_location','${EMAIL}',NOW() FROM clinics;`);
  await go(`${APP}/settings?google=connected`);
}

// ── 4 · Location picker ─────────────────────────────────────────────────────
await say("04", "Choosing the location",
  "The business picks which of their locations to connect. Kirtify only ever touches this one location after this.");
await wait(2500);
const firstLocation = page
  .locator("button")
  .filter({ hasText: /Main Branch|Clinic|Location/i })
  .first();
if (await firstLocation.isVisible().catch(() => false)) {
  await firstLocation.click();
  await wait(2500);
}
await page.getByRole("button", { name: /Confirm location/i }).click();
await wait(4500);

// ── 5 · Reviews arrive ──────────────────────────────────────────────────────
await say("05", "Reviews arrive from that location",
  "Kirtify reads star rating, review text and timestamp from Google Business Profile.");
await go(`${APP}/dashboard`);
await wait(1800);
await page.getByRole("button", { name: /Sync now/i }).first().click();
await wait(9500);
await page.mouse.wheel(0, 300);
await wait(4000);

// ── 6 · Reply and publish ───────────────────────────────────────────────────
// Filtering to unanswered 1-star first demonstrates the claim the product
// actually makes: the reviews that need a human are the ones surfaced first.
await say("06", "Replying, and publishing back to Google",
  "The business owner writes or approves this reply, and Kirtify publishes it back to Google Business Profile through the same API.");
await page.mouse.wheel(0, -300);
await wait(1500);
await page.getByRole("button", { name: /^Unanswered$/i }).click();
await wait(1600);
await page.getByRole("button", { name: /^1★$/ }).click();
await wait(3000);
await page.getByRole("button", { name: /View & Reply/i }).first().click();
await wait(3500);
await page.mouse.wheel(0, 380);
await wait(3500);
await page.getByRole("button", { name: /^empathetic$/i }).click();
await wait(4000);
const post = page.getByRole("button", { name: /Post Official Reply/i }).first();
await post.scrollIntoViewIfNeeded();
await wait(1500);
await post.click();
await wait(6500);

// ── 7 · Disconnect ──────────────────────────────────────────────────────────
await say("07", "Disconnecting",
  "Disconnecting revokes the token at Google immediately and deletes it from our database.");
await go(`${APP}/settings`);
await page.getByRole("button", { name: "Integrations" }).click();
await wait(3000);
await page.getByRole("button", { name: /Disconnect Google/i }).click();
await wait(7000);

await say(null);
await wait(2000);

await ctx.close();
await browser.close();
console.log(`\n✅ Recorded to ${OUT}`);
if (!LIVE) {
  console.log("   Reference cut — watermarked, not submittable.");
  console.log("   Record the submission cut with DEMO_LIVE=1 on your deployed app.");
}
