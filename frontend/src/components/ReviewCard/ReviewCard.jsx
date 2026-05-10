import { useState } from "react";
import { useDispatch } from "react-redux";
import { markReplied } from "../../store/reviewsSlice.js";
import { addNotification } from "../../store/notificationsSlice.js";
import StarRating from "../StarRating.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function ReviewCard({ review }) {
  const dispatch = useDispatch();
  const { dark } = useTheme();

  const [showPanel, setShowPanel] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [generating, setGenerating] = useState(false);

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

  const handleGenerateReply = async () => {
    setGenerating(true);
    setShowPanel(true);
    // TODO: Replace with real AI API call
    // const reply = await generateAIReply(review.id, review.text);
    await new Promise((r) => setTimeout(r, 1400));
    setReplyText(
      `Hi ${review.name.split(" ")[0]}, thank you for your feedback. We truly care about every patient's experience and would love to make this right for you. Please reach out to us directly.`,
    );
    setGenerating(false);
  };

  const handleApprove = () => {
    // Dispatch to Redux — updates the review in global state
    dispatch(markReplied(review.id));
    // Also add a success notification
    dispatch(
      addNotification({
        type: "success",
        message: `Reply posted for ${review.name}'s review`,
      }),
    );
    setShowPanel(false);
    setReplyText("");
  };

  return (
    <div
      className={`group relative border rounded-2xl transition-all duration-300 ${theme.card} ${isUrgent ? "ring-1 ring-red-500/20" : ""}`}
    >
      {/* Sentiment Accent Bar */}
      <div
        className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full ${isUrgent ? "bg-red-500" : review.rating >= 4 ? "bg-emerald-500" : "bg-amber-500"}`}
      />

      <div className="p-5">
        <div className="flex flex-col md:flex-row gap-5">
          {/* Avatar + Platform Badge */}
          <div className="flex flex-row md:flex-col items-center md:items-start gap-3 flex-shrink-0">
            <div className="relative">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-inner"
                style={{
                  background: `linear-gradient(135deg, hsl(${review.id * 60}, 60%, 50%), hsl(${review.id * 60}, 70%, 40%))`,
                }}
              >
                {review.name[0]}
              </div>
              <div
                className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border-2 ${dark ? "border-slate-900" : "border-white"} ${platform.bg} ${platform.color} flex items-center justify-center text-[10px] font-black`}
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
                    className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${dark ? "border-slate-800 text-slate-500" : "border-slate-100 text-slate-400"}`}
                  >
                    <span className="text-indigo-500">✦</span> AI READY
                  </div>
                )}
              </div>

              <button
                className={`p-2 rounded-xl transition-colors ${dark ? "hover:bg-slate-800 text-slate-600" : "hover:bg-slate-100 text-slate-400"}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                  />
                </svg>
              </button>
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
              92% Match Score
            </span>
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
              className={`w-full p-4 rounded-xl border text-sm transition-all focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none ${theme.textarea}`}
            />
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleApprove}
              disabled={!replyText || generating}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all active:scale-95"
            >
              Post Official Reply
            </button>
            <button
              onClick={handleGenerateReply}
              disabled={generating}
              className={`px-4 py-2.5 border text-xs font-bold rounded-xl transition-all ${dark ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "border-slate-200 hover:bg-white text-slate-600"}`}
            >
              Regenerate
            </button>
            <button
              onClick={() => {
                setShowPanel(false);
                setReplyText("");
              }}
              className={`ml-auto text-xs font-bold ${theme.muted} hover:text-red-500 transition-colors`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}