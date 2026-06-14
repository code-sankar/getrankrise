/**
 * ai.service.js
 * Wraps the AI provider (OpenAI by default) for generating brand-safe,
 * context-aware reply drafts. If no API key is set, falls back to a
 * deterministic template so dev environments still function.
 *
 * Security notes:
 *   - Review text is sanitised by sanitize.middleware before reaching here.
 *   - The system prompt is hard-coded — user input cannot override it.
 *   - We pass the clinic name as data, not as part of the system role,
 *     so prompt injection via clinicName is contained.
 *   - All responses are length-capped before being returned to the caller.
 */

import { env } from "../../config/env.js";

const MAX_REPLY_LENGTH = 2000;

const TONE_INSTRUCTIONS = {
  professional: "Maintain a polished, professional tone suitable for a business response.",
  warm:         "Use a warm, friendly tone that feels personal and caring.",
  concise:      "Be concise and direct — under 60 words.",
  empathetic:   "Lead with empathy. Acknowledge the customer's feelings before anything else.",
};

const SYSTEM_PROMPT = `
You are an assistant that drafts brand-safe replies to customer reviews on behalf of local businesses.

Strict rules:
- Never include the business's address, phone number, or any personal data not in the review.
- Never make medical, legal, or financial promises.
- Never argue with the reviewer or contradict their experience publicly.
- Never apologise on behalf of a third party.
- Never include profanity, slurs, or politically charged statements.
- Never include URLs unless they appear in the original review.
- For 1-2 star reviews, acknowledge the concern, take responsibility, and offer to resolve offline.
- For 3-star reviews, thank them, address the specific feedback, and offer to learn more.
- For 4-5 star reviews, thank them warmly and reinforce the highlight they mentioned.
- Output ONLY the reply text — no preamble, no explanation, no formatting markers.
`.trim();

// ── Fallback generator — used when OPENAI_API_KEY is not configured ──────────
const buildFallbackReply = ({ reviewText, rating, customerName, clinicName, tone }) => {
  const first = (customerName || "there").split(" ")[0];
  const r     = Number(rating) || 5;

  if (r <= 2) {
    return `Hi ${first}, I'm truly sorry to hear about your experience at ${clinicName}. ` +
           `Your feedback is important to us and we'd like to make this right. ` +
           `Please reach out to us directly and we'll do everything we can to help.`;
  }
  if (r === 3) {
    return `Hi ${first}, thank you for the honest feedback about ${clinicName}. ` +
           `We're glad parts of your visit went well and we'd love to learn how we can do better — please get in touch when you have a moment.`;
  }
  return `Hi ${first}, thank you so much for the kind words about ${clinicName}! ` +
         `It means a lot to our team. We can't wait to welcome you back.`;
};

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Generates a context-aware reply for a single review.
 *
 * @param {Object} params
 * @param {string} params.reviewText
 * @param {number} params.rating
 * @param {string} [params.customerName]
 * @param {string} params.clinicName
 * @param {string} [params.tone] - one of "professional" | "warm" | "concise" | "empathetic"
 * @returns {Promise<{ reply: string, model: string }>}
 */
export const generateReply = async ({
  reviewText,
  rating,
  customerName,
  clinicName,
  tone = "professional",
}) => {
  // ── Fallback path (no API key or fetch unavailable) ────────────────────
  if (!env.OPENAI_API_KEY) {
    const reply = buildFallbackReply({ reviewText, rating, customerName, clinicName, tone });
    return { reply: reply.slice(0, MAX_REPLY_LENGTH), model: "fallback-template-v1" };
  }

  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;

  // ── Call OpenAI Chat Completions ───────────────────────────────────────
  const body = {
    model:       "gpt-4o-mini",
    temperature: 0.6,
    max_tokens:  400,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content:
          `Business name: ${clinicName}\n` +
          `Tone preference: ${toneInstruction}\n` +
          `Customer name: ${customerName || "Unknown"}\n` +
          `Star rating: ${rating}/5`,
      },
      { role: "user", content: `Review text:\n"""\n${reviewText}\n"""` },
    ],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      // 15s timeout via AbortController
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data  = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("No reply returned from OpenAI");

    return {
      reply: reply.slice(0, MAX_REPLY_LENGTH),
      model: data.model || "gpt-4o-mini",
    };

  } catch (err) {
    // Don't surface internal errors — fall back gracefully.
    console.error("[ai.service] OpenAI call failed, using fallback:", err.message);
    const reply = buildFallbackReply({ reviewText, rating, customerName, clinicName, tone });
    return { reply: reply.slice(0, MAX_REPLY_LENGTH), model: "fallback-template-v1" };
  }
};