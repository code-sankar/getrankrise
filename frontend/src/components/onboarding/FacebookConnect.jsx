/**
 * FacebookConnect.jsx
 * Facebook integration card for Settings → Integrations (or onboarding).
 * OAuth-redirect flow like GoogleConnect: connect → consent → callback returns
 * with ?facebook=connected → Page picker → bind.
 *
 * States (derived from connection status + URL params):
 *   loading       → fetching connection status
 *   disconnected  → "Connect Facebook" button
 *   picking       → came back from consent (?facebook=connected) OR
 *                   status=pending_location → Page picker
 *   connected     → summary card + Disconnect
 *   error/notice  → denied / invalid_state / exchange_failed banners, plus the
 *                   App-Review-pending notice (FB_PERMISSION)
 *
 * Props:
 *   onConnected(connection) — called after a Page is bound.
 *   dark                    — theme flag (default true).
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { facebookAPI } from "../../api/facebookAPI.js";

const CALLBACK_ERRORS = {
  denied: "You cancelled the Facebook consent screen. Connect when you're ready.",
  invalid_state: "That connection attempt expired or was invalid. Please try again.",
  missing_code: "Facebook didn't return an authorization code. Please try again.",
  exchange_failed: "We couldn't complete the Facebook connection. Please try again.",
};

// ── Presentational bits — MODULE SCOPE, deliberately ─────────────────────────
// Declared inside the component body these are a fresh component TYPE on every
// render, so React unmounts and remounts the subtree each time rather than
// updating it. Harmless-looking today (neither holds state), but it is the
// standing trap react-hooks/static-components exists to catch: the first
// <input> added inside Banner would lose focus on every keystroke.
function Header({ textPrimary, textMuted }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div className="w-9 h-9 rounded-xl bg-[#1877f2]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-[#1877f2] font-black text-base">f</span>
      </div>
      <div>
        <h3 className={`font-bold text-sm ${textPrimary}`}>Facebook</h3>
        <p className={`text-xs ${textMuted}`}>Sync your Page recommendations into the feed</p>
      </div>
    </div>
  );
}

function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div
      className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
        banner.tone === "error"
          ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
          : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
      }`}
    >
      {banner.text}
    </div>
  );
}

export default function FacebookConnect({ onConnected, dark = true }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [phase, setPhase] = useState("loading"); // loading | disconnected | picking | connected
  const [connection, setConnection] = useState(null);
  const [pages, setPages] = useState(null); // [{ id, name, category }]
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  // The ?facebook=… param is an INITIAL CONDITION, not evolving state: it is
  // present on the first render after the consent redirect and never again
  // (the effect below strips it). Capturing it in a lazy initialiser lets the
  // banner render correctly on the very first paint, and keeps the URL-derived
  // state out of an effect that would have to setState to express it.
  const [callbackParam] = useState(
    () => new URLSearchParams(window.location.search).get("facebook"),
  );
  const [banner, setBanner] = useState(() =>
    callbackParam && callbackParam !== "connected" && CALLBACK_ERRORS[callbackParam]
      ? { tone: "error", text: CALLBACK_ERRORS[callbackParam] }
      : null,
  ); // { tone: "error"|"info", text }

  // ── Theme tokens (obsidian design system) ───────────────────────────────────
  const card = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const textPrimary = dark ? "text-white" : "text-slate-900";
  const textMuted = "text-slate-500 dark:text-slate-400";
  const rowHover = dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50";
  const rowSelected = dark ? "bg-blue-500/10 border-blue-500/40" : "bg-blue-50 border-blue-300";
  const rowBorder = dark ? "border-slate-800" : "border-slate-100";

  // ── Load pages (after connect / when pending_location) ──────────────────────
  const loadPages = useCallback(async () => {
    setBusy(true);
    try {
      const list = await facebookAPI.getPages();
      setPages(list);
      setPhase("picking");
      if (list.length === 0) {
        setBanner({ tone: "info", text: "No Facebook Pages found on this account." });
      }
    } catch (err) {
      if (err.fbPermission) {
        setBanner({ tone: "info", text: err.message });
        setPhase("picking");
        setPages([]);
      } else {
        setBanner({
          tone: "error",
          text: err.response?.data?.message || "Couldn't load your Facebook Pages.",
        });
        setPhase("disconnected");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Initial load: connection status + callback params ───────────────────────
  // The OAuth callback param is read in the effect below rather than in a
  // useCallback the effect invokes. Two things changed and both were bugs:
  //
  //   1. loadState() called setBanner SYNCHRONOUSLY in the effect body, which
  //      is the cascading render react-hooks/set-state-in-effect flags. The
  //      banner is now seeded in the lazy useState initialiser above, so it is
  //      correct on the FIRST paint instead of flashing in on a second render.
  //   2. loadState depended on [searchParams, setSearchParams] and its own
  //      body called setSearchParams — so cleaning the URL changed the dep,
  //      rebuilt the callback, and re-ran the effect, refetching the
  //      connection list a second time on every return from consent. Mount-only
  //      is what this was always meant to be.
  useEffect(() => {
    let alive = true;

    // Clean the URL so a refresh doesn't replay the banner or re-enter the
    // picker. callbackParam holds the value captured before this strips it.
    if (callbackParam) {
      searchParams.delete("facebook");
      setSearchParams(searchParams, { replace: true });
    }

    (async () => {
      try {
        const connections = await facebookAPI.getConnections();
        if (!alive) return;
        const fb = connections.find((c) => c.platform === "facebook");

        if (fb && fb.status === "connected") {
          setConnection(fb);
          setPhase("connected");
        } else if (
          (fb && fb.status === "pending_location") ||
          callbackParam === "connected"
        ) {
          await loadPages();
        } else {
          setPhase("disconnected");
        }
      } catch {
        if (alive) setPhase("disconnected");
      }
    })();

    return () => {
      alive = false;
    };
    // Mount-only by design — see the note above. searchParams/setSearchParams
    // are intentionally omitted: including them reintroduces the double fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setBusy(true);
    try {
      const consentUrl = await facebookAPI.startConnect();
      window.location.href = consentUrl; // full navigation to Facebook
    } catch (err) {
      setBusy(false);
      if (err.notConfigured) {
        setBanner({ tone: "info", text: err.message });
      } else {
        toast.error(err.response?.data?.message || "Could not start the Facebook connection.");
      }
    }
  };

  const handleSelect = async () => {
    if (!selectedId) return;
    const page = pages.find((p) => p.id === selectedId);
    setBusy(true);
    try {
      const conn = await facebookAPI.selectPage({ pageId: page.id, pageName: page.name });
      setConnection(conn);
      setPhase("connected");
      toast.success(`Connected ${page.name} on Facebook`);
      onConnected?.(conn);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not connect that Page.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect Facebook? Review syncing from this Page will stop.")) return;
    setBusy(true);
    try {
      await facebookAPI.disconnect();
      setConnection(null);
      setPages(null);
      setSelectedId(null);
      setPhase("disconnected");
      toast.success("Facebook disconnected");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not disconnect Facebook.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className={`border rounded-2xl p-5 ${card}`}>
        <div className={`h-9 w-40 rounded-lg animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────────
  if (phase === "connected" && connection) {
    return (
      <div className={`border rounded-2xl p-5 ${card}`}>
        <Header textPrimary={textPrimary} textMuted={textMuted} />
        <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${rowBorder}`}>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${textPrimary}`}>
              {connection.locationName || "Connected Facebook Page"}
            </p>
            <p className={`text-xs ${textMuted} flex items-center gap-1.5`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {connection.connectedEmail
                ? `Connected as ${connection.connectedEmail}`
                : "Connected"}{" "}
              · syncing on your plan's schedule
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // ── Picking (page selector) ─────────────────────────────────────────────────
  if (phase === "picking") {
    return (
      <div className={`border rounded-2xl p-5 ${card}`}>
        <Header textPrimary={textPrimary} textMuted={textMuted} />
        <Banner banner={banner} />

        {pages && pages.length > 0 && (
          <>
            <p className={`mt-4 mb-2 text-xs font-semibold ${textMuted}`}>
              Choose the Page to sync reviews from:
            </p>
            <ul className={`border rounded-xl divide-y ${rowBorder} ${dark ? "divide-slate-800" : "divide-slate-100"}`}>
              {pages.map((p) => {
                const isSel = selectedId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full text-left flex items-center justify-between gap-3 px-4 py-3 border transition-colors ${
                        isSel ? rowSelected : `border-transparent ${rowHover}`
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${textPrimary}`}>{p.name}</p>
                        {p.category && <p className={`text-xs truncate ${textMuted}`}>{p.category}</p>}
                      </div>
                      {isSel && <span className="text-blue-400 text-sm font-bold">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={handleSelect}
              disabled={!selectedId || busy}
              className="mt-4 text-sm font-semibold px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white transition-colors disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Connect this Page"}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Disconnected ────────────────────────────────────────────────────────────
  return (
    <div className={`border rounded-2xl p-5 ${card}`}>
      <Header textPrimary={textPrimary} textMuted={textMuted} />
      <Banner banner={banner} />
      <button
        onClick={handleConnect}
        disabled={busy}
        className="mt-4 text-sm font-semibold px-4 py-2 rounded-lg bg-[#1877f2] hover:bg-[#1466d6] text-white transition-colors disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Connect Facebook"}
      </button>
    </div>
  );
}