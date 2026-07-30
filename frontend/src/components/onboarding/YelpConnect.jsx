/**
 * YelpConnect.jsx
 * Yelp integration card — usable in the Settings → Integrations tab or in
 * onboarding. Yelp has no OAuth, so this is a simple search → pick → bind flow
 * (no redirect, no location picker round-trip like GoogleConnect).
 *
 * States:
 *   loading      → fetching current connection status
 *   form         → location (+ optional term) inputs, "Search Yelp" button
 *   results      → list of matched businesses, each with a "Connect" button
 *   connected    → summary card + "Disconnect"
 *   not-configured → info banner when the server has no YELP_API_KEY (503)
 *
 * Props:
 *   onConnected(connection)  — called after a business is bound (parent may
 *                              advance an onboarding step or refresh a list).
 *   dark                     — theme flag (default true), same as GoogleConnect.
 *   defaultLocation          — prefill for the location field (e.g. clinic.location).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { yelpAPI } from "../../api/yelpAPI.js";

export default function YelpConnect({ onConnected, dark = true, defaultLocation = "" }) {
  const [phase, setPhase] = useState("loading"); // loading | form | results | connected
  const [connection, setConnection] = useState(null);
  const [mode, setMode] = useState("search"); // search | url
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState(defaultLocation || "");
  const [url, setUrl] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [connectingId, setConnectingId] = useState(null);
  const [banner, setBanner] = useState(null); // { tone: "error"|"info", text }

  // ── Theme tokens (obsidian design system, cyan accent) ──────────────────────
  const card = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const textPrimary = dark ? "text-white" : "text-slate-900";
  const textMuted = dark ? "text-slate-400" : "text-slate-500";
  const inputBg = dark
    ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400";
  const rowHover = dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50";
  const rowBorder = dark ? "border-slate-800" : "border-slate-100";

  // ── Initial load: is Yelp already connected? ────────────────────────────────
  const loadState = useCallback(async () => {
    try {
      const connections = await yelpAPI.getConnections();
      const yelp = connections.find((c) => c.platform === "yelp");
      if (yelp && yelp.status === "connected") {
        setConnection(yelp);
        setPhase("connected");
      } else {
        setPhase("form");
      }
    } catch {
      // Non-fatal: fall back to the form so the user can still try to connect.
      setPhase("form");
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // ── Search ──────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!location.trim()) {
      setBanner({ tone: "error", text: "Enter a city or address to search Yelp." });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const businesses = await yelpAPI.search({ term: term.trim(), location: location.trim() });
      setResults(businesses);
      setPhase("results");
      if (businesses.length === 0) {
        setBanner({ tone: "info", text: "No Yelp businesses matched. Try a broader location or name." });
      }
    } catch (err) {
      if (err.yelpNotConfigured) {
        setBanner({
          tone: "info",
          text: "Yelp search isn't configured on the server yet. Ask your admin to set YELP_API_KEY.",
        });
      } else {
        setBanner({
          tone: "error",
          text: err.response?.data?.message || "Yelp search failed. Please try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Resolve a pasted Yelp URL / alias → one confirmable result ──────────────
  const handleResolve = async () => {
    if (!url.trim()) {
      setBanner({ tone: "error", text: "Paste your yelp.com/biz/… link (or business alias)." });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const business = await yelpAPI.resolve({ ref: url.trim() });
      setResults([business]); // reuse the results list + Connect button
      setPhase("results");
    } catch (err) {
      if (err.yelpNotConfigured) {
        setBanner({
          tone: "info",
          text: "Yelp lookup isn't configured on the server yet. Ask your admin to set YELP_API_KEY.",
        });
      } else {
        setBanner({
          tone: "error",
          text: err.response?.data?.message || "Couldn't read that Yelp link. Check the URL and try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Connect a chosen business ───────────────────────────────────────────────
  const handleConnect = async (biz) => {
    setConnectingId(biz.id);
    try {
      const conn = await yelpAPI.connect({ businessId: biz.id, businessName: biz.name });
      setConnection(conn);
      setPhase("connected");
      toast.success(`Connected ${biz.name} on Yelp`);
      onConnected?.(conn);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not connect that Yelp business.");
    } finally {
      setConnectingId(null);
    }
  };

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect Yelp? Review syncing from Yelp will stop.")) return;
    setBusy(true);
    try {
      await yelpAPI.disconnect();
      setConnection(null);
      setResults([]);
      setPhase("form");
      toast.success("Yelp disconnected");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not disconnect Yelp.");
    } finally {
      setBusy(false);
    }
  };

  // ── Small presentational bits ───────────────────────────────────────────────
  const Header = () => (
    <div className="flex items-center gap-3 mb-1">
      <div className="w-9 h-9 rounded-xl bg-[#d32323]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-[#d32323] font-black text-sm">Y</span>
      </div>
      <div>
        <h3 className={`font-bold text-sm ${textPrimary}`}>Yelp</h3>
        <p className={`text-xs ${textMuted}`}>Sync your Yelp reviews into the feed</p>
      </div>
    </div>
  );

  const Banner = () =>
    banner ? (
      <div
        className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
          banner.tone === "error"
            ? "bg-red-500/10 border-red-500/30 text-red-400"
            : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
        }`}
      >
        {banner.text}
      </div>
    ) : null;

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
        <Header />
        <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${rowBorder}`}>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${textPrimary}`}>
              {connection.locationName || "Connected Yelp business"}
            </p>
            <p className={`text-xs ${textMuted} flex items-center gap-1.5`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Connected · syncing on your plan's schedule
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // ── Form / Results ──────────────────────────────────────────────────────────
  return (
    <div className={`border rounded-2xl p-5 ${card}`}>
      <Header />

      {/* Mode toggle: search by name/location, or paste the Yelp URL directly */}
      <div className={`mt-4 inline-flex rounded-lg border p-0.5 ${dark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-100"}`}>
        {[
          ["search", "Search"],
          ["url", "Paste URL"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setMode(value);
              setBanner(null);
              if (phase === "results") setPhase("form");
            }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
              mode === value
                ? "bg-cyan-600 text-white"
                : dark
                  ? "text-slate-400 hover:text-slate-200"
                  : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "search" ? (
        <div className="mt-3 space-y-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Business name (optional — defaults to your clinic)"
            className={`w-full text-sm rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500/40 ${inputBg}`}
          />
          <div className="flex gap-2">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="City or address (required)"
              className={`flex-1 text-sm rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500/40 ${inputBg}`}
            />
            <button
              onClick={handleSearch}
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? "Searching…" : "Search Yelp"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResolve()}
              placeholder="https://www.yelp.com/biz/your-business"
              className={`flex-1 text-sm rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500/40 ${inputBg}`}
            />
            <button
              onClick={handleResolve}
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? "Looking up…" : "Look up"}
            </button>
          </div>
          <p className={`text-[11px] ${textMuted}`}>
            Open your Yelp page and copy the link — it looks like
            <span className="font-mono"> yelp.com/biz/your-business</span>.
          </p>
        </div>
      )}

      <Banner />

      {phase === "results" && results.length > 0 && (
        <ul className={`mt-4 border rounded-xl divide-y ${rowBorder} ${dark ? "divide-slate-800" : "divide-slate-100"}`}>
          {results.map((biz) => (
            <li key={biz.id} className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${rowHover}`}>
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${textPrimary}`}>{biz.name}</p>
                <p className={`text-xs truncate ${textMuted}`}>
                  {biz.address || "—"}
                  {biz.rating != null && (
                    <span className="ml-2 text-amber-400">
                      ★ {biz.rating} {biz.reviewCount != null && `(${biz.reviewCount})`}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleConnect(biz)}
                disabled={connectingId === biz.id}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {connectingId === biz.id ? "Connecting…" : "Connect"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}