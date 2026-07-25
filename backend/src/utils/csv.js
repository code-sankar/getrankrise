// backend/src/utils/csv.js
//
// Recipient CSV parsing for campaign import. Hand-rolled rather than a
// dependency because the grammar we accept is small and the failure modes
// (quoted commas, quoted quotes, CRLF, BOM, header variants) are exactly the
// ones worth owning tests for. RFC-4180 quoting rules.
//
// Accepted header (case-insensitive, order-free): name, phone[, email]
// A headerless file whose first row looks like data (second column parses as
// a phone) is accepted too — clinics export from everything.

/**
 * RFC-4180-ish CSV → array of string arrays.
 * Handles: quoted fields, escaped quotes (""), commas/newlines inside quotes,
 * CRLF and LF, UTF-8 BOM. Does NOT handle: other delimiters, multi-char
 * quotes — reject those files rather than guess.
 */
export function parseCsv(text) {
  if (typeof text !== "string") return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      // skip blank lines
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // trailing field/row without final newline
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
  }
  return rows;
}

/**
 * Loose-E.164 normalisation.
 * Strips spaces/dashes/dots/parens; keeps a leading +. Bare 10-digit numbers
 * get the clinic's country calling code prefixed (we route SMS by clinic
 * countryCode already, so we know it). Returns null when unsalvageable.
 *
 * @param {string} raw
 * @param {string} [defaultCc] calling code WITHOUT +, e.g. "91"
 */
export function normalizePhone(raw, defaultCc = "") {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);

  const hasPlus = s.startsWith("+");
  const digits = hasPlus ? s.slice(1) : s;
  if (!/^\d+$/.test(digits)) return null;

  if (!hasPlus) {
    // Trunk prefix: "09876543210" is how Indian (and UK etc.) contact exports
    // write national numbers. Strip the leading 0, then treat as national.
    let national = digits;
    if (defaultCc && national.length === 11 && national.startsWith("0")) {
      national = national.slice(1);
    }
    // 10-digit national number + known country → prefix. Anything else
    // without a + is ambiguous; refuse rather than guess a country.
    if (defaultCc && national.length === 10) s = `+${defaultCc}${national}`;
    else if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith("0"))
      s = `+${digits}`;
    else return null;
  }

  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

// Map ISO-3166 alpha-2 (Clinic.countryCode) → calling code, for the markets
// that matter now. Missing entries just mean bare 10-digit numbers are
// rejected for that clinic — extend as you expand.
export const CALLING_CODES = Object.freeze({
  IN: "91",
  US: "1",
  GB: "44",
  AE: "971",
  SG: "65",
  AU: "61",
});

/**
 * CSV text → { recipients: [{name, phone}], invalid: [{line, raw, reason}] }
 * Dedupe within the file (first occurrence wins).
 */
export function parseRecipientsCsv(text, { countryCode } = {}) {
  const cc = CALLING_CODES[String(countryCode || "").toUpperCase()] || "";
  const rows = parseCsv(text);
  if (rows.length === 0) return { recipients: [], invalid: [] };

  // Header detection
  const first = rows[0].map((h) => h.trim().toLowerCase());
  let nameIdx = first.indexOf("name");
  let phoneIdx = first.findIndex((h) => h === "phone" || h === "mobile" || h === "phone number");
  let start = 1;

  if (phoneIdx === -1) {
    // Headerless: assume [name, phone] if col 1 of row 0 parses as a phone.
    if (rows[0].length >= 2 && normalizePhone(rows[0][1], cc)) {
      nameIdx = 0;
      phoneIdx = 1;
      start = 0;
    } else {
      return {
        recipients: [],
        invalid: [{ line: 1, raw: rows[0].join(","), reason: "No 'phone' column found" }],
      };
    }
  }
  if (nameIdx === -1) nameIdx = phoneIdx === 0 ? 1 : 0;

  const recipients = [];
  const invalid = [];
  const seen = new Set();

  for (let i = start; i < rows.length; i++) {
    const raw = rows[i];
    const phone = normalizePhone(raw[phoneIdx], cc);
    const name = (raw[nameIdx] || "").trim().slice(0, 100) || null;

    if (!phone) {
      invalid.push({ line: i + 1, raw: raw.join(","), reason: "Invalid phone number" });
      continue;
    }
    if (seen.has(phone)) continue; // in-file dedupe, first wins
    seen.add(phone);
    recipients.push({ name, phone });
  }

  return { recipients, invalid };
}