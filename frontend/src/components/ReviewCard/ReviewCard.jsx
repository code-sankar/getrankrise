import { useState } from "react";
import { useDispatch } from "react-redux";
import { markReplied } from "../../store/reviewsSlice.js";
import { addNotification } from "../../store/notificationsSlice.js";
import { replyToReview, generateAIReply } from "../../hooks/reviews.hook.js";
import StarRating from "../StarRating.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function ReviewCard({ review }) {
  const dispatch = useDispatch();
  const { dark } = useTheme();

  const [showPanel, setShowPanel] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tone, setTone] = useState("professional");

  const isUrgent = review.rating <= 2;

  const theme = {
    card: dark
      ? "bg-slate-900/40 border-slate-800 hover:border-slate-700"
      : "bg-white border-slate-200 hover:shadow-md",
    panel: dark
      ? "bg-slate-950/50 border-slate-800"
      : "bg-slate-50 border-slate-200",
    text: dark ? "text-slate-100" : "text-slate-900",
    muted: dark ? "text-slate-400" : "text-slate-500",
    body: dark ? "text-slate-300" : "text-slate-600",
    textarea: dark
      ? "bg-slate-900 border-slate-800 text-slate-200 focus:border-indigo-500"
      : "bg-white border-slate-300 text-slate-800 focus:border-indigo-500",
  };

  const getPlatform = (p) =>
    ({
      Google: { color: "text-blue-500", bg: "bg-blue-500/10", label: "G" },
      Yelp: { color: "text-red-500", bg: "bg-red-500/10", label: "Y" },
      Facebook: { color: "text-blue-600", bg: "bg-blue-600/10", label: "f" },
    })[p] || { color: "text-slate-400", bg: "bg-slate-400/10", label: "R" };

  const platform = getPlatform(review.platform);

  // ── AI reply generation — calls real backend ─────────────────────────────
  const handleGenerateReply = async () => {
    setGenerating(true);
    setShowPanel(true);

    try {
      const reply = await generateAIReply(review.id, review.text, tone);
      if (reply) {
        setReplyText(reply);
      } else {
        // Backend not connected yet — fall back to a sensible local draft so
        // the UI keeps working. Toast for the failure already came from the hook.
        setReplyText(
          `Hi ${review.name.split(" ")[0]}, thank you for sharing your feedback. ` +
            `We genuinely appreciate it and would love to make sure your experience is the best it can be. ` +
            `Please reach out to us directly so we can help.`,
        );
      }
    } catch (err) {
      // Hook already toasted — leave the panel open with empty textarea
      console.error("AI reply generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  // ── Post the reply — calls real backend, updates Redux on success ───────
  const handleApprove = async () => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);

    try {
      await replyToReview(dispatch, review.id, replyText.trim());
      // Hook handles the optimistic Redux update and activity log already,
      // but mark the legacy reviewsSlice key too in case it's still in use.
      dispatch(markReplied(review.id));
      dispatch(
        addNotification({
          type: "success",
          message: `Reply posted for ${review.name}'s review`,
        }),
      );
      setShowPanel(false);
      setReplyText("");
    } catch (err) {
      console.error("Reply post failed:", err);
      // Hook already toasted
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`group relative border rounded-2xl transition-all duration-300 ${theme.card} ${isUrgent ? "ring-1 ring-red-500/20" : ""}`}
    >
      {/* Sentiment Accent Bar */}
      <div
        className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full ${
          isUrgent
            ? "bg-red-500"
            : review.rating >= 4
              ? "bg-emerald-500"
              : "bg-amber-500"
        }`}
      />

      <div className="p-4 sm:p-6 flex items-start gap-3 sm:gap-5">
        {/* Avatar + platform badge */}
        <div className="flex items-center gap-2 md:gap-0">
          <div className="relative flex-shrink-0">
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${platform.bg} ${platform.color} flex items-center justify-center font-black text-sm border border-current/20`}
            >
              {review.name?.[0] || "?"}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 ${
                dark ? "border-slate-900" : "border-white"
              } ${platform.bg} ${platform.color} flex items-center justify-center text-[10px] font-black`}
            >
              {platform.label}
            </div>
          </div>
          <div className="md:hidden flex flex-col">
            <span className={`font-bold text-sm ${theme.text}`}>
              {review.name}
            </span>
            <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">
              {review.platform} Review
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="hidden md:flex items-center gap-2 mb-1">
            <span className={`font-bold ${theme.text}`}>{review.name}</span>
            <span className={`text-xs ${theme.muted}`}>•</span>
            <span
              className={`text-[11px] font-bold uppercase tracking-widest ${theme.muted}`}
            >
              {review.platform}
            </span>
            {review.replied && (
              <span className="ml-2 flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold uppercase">
                ✓ Replied
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mb-3">
            <StarRating rating={review.rating} size="sm" />
            <span className={`text-xs font-medium ${theme.muted}`}>
              {review.date}
            </span>
            {isUrgent && !review.replied && (
              <span className="animate-pulse text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-md font-black uppercase">
                Action Required
              </span>
            )}
          </div>

          <p className={`text-sm leading-relaxed mb-4 ${theme.body}`}>
            {review.text}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!review.replied ? (
                <button
                  onClick={() => {
                    setShowPanel(!showPanel);
                    if (!replyText) handleGenerateReply();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  View & Reply
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </button>
              ) : (
                <span className={`text-xs font-bold ${theme.muted}`}>
                  ✓ Replied
                </span>
              )}

              {!review.replied && (
                <div
                  className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                    dark
                      ? "border-slate-800 text-slate-500"
                      : "border-slate-100 text-slate-400"
                  }`}
                >
                  <span className="text-indigo-500">✦</span> AI READY
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reply Panel */}
      {showPanel && (
        <div className={`m-4 mt-0 p-5 rounded-2xl border ${theme.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span
                className={`text-xs font-bold uppercase tracking-widest ${theme.text}`}
              >
                AI Assistant Draft
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase">
              Context-aware reply
            </span>
          </div>
          {/* Tone selector — applies on the next Generate / Regenerate */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className={`text-[10px] font-bold uppercase tracking-widest mr-1 ${theme.muted}`}>Tone</span>
            {["professional", "warm", "empathetic", "concise"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                disabled={generating || submitting}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all disabled:opacity-50 ${
                  tone === t
                    ? "bg-indigo-600 text-white"
                    : dark
                      ? "bg-slate-800 text-slate-400 hover:text-slate-200"
                      : "bg-slate-100 text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {generating ? (
            <div
              className={`w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 ${dark ? "border-slate-800" : "border-slate-200"}`}
            >
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
              </div>
              <span className={`text-xs font-bold ${theme.muted}`}>
                Analyzing sentiment & drafting...
              </span>
            </div>
          ) : (
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              placeholder="Your reply will appear here once generated, or you can write your own..."
              className={`w-full p-4 rounded-xl border text-sm transition-all focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none ${theme.textarea}`}
            />
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleApprove}
              disabled={!replyText || generating || submitting}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all active:scale-95"
            >
              {submitting ? "Posting..." : "Post Official Reply"}
            </button>
            <button
              onClick={handleGenerateReply}
              disabled={generating || submitting}
              className={`px-4 py-2.5 border text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${
                dark
                  ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                  : "border-slate-200 hover:bg-white text-slate-600"
              }`}
            >
              Regenerate
            </button>
            <button
              onClick={() => {
                setShowPanel(false);
                setReplyText("");
              }}
              disabled={submitting}
              className={`ml-auto text-xs font-bold ${theme.muted} hover:text-red-500 transition-colors disabled:opacity-50`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
