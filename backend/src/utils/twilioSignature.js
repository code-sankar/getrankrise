// backend/src/utils/twilioSignature.js
//
// Validates X-Twilio-Signature on inbound webhooks (the STOP handler).
// Twilio's scheme: base64(HMAC-SHA1(authToken, fullUrl + params sorted by key
// with key+value concatenated)). Without this check, anyone who finds the
// webhook URL can opt out arbitrary phones — a denial-of-service against
// your own campaigns.

import crypto from "node:crypto";

/**
 * @param {string} authToken   TWILIO_AUTH_TOKEN
 * @param {string} signature   X-Twilio-Signature header
 * @param {string} url         the EXACT public URL Twilio was configured with
 *                             (scheme, host, path, query — behind a proxy this
 *                             must be built from API_PUBLIC_URL, not req.host)
 * @param {object} params      the POST body params (application/x-www-form-urlencoded)
 */
export function validateTwilioSignature(authToken, signature, url, params = {}) {
  if (!authToken || !signature || !url) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}