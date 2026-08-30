/**
 * GoogleConnect.jsx
 * Replaces Onboarding step 1 (the "paste your Google Business URL" form).
 *
 * Why the old step had to go: a pasted g.page URL gives the backend nothing it
 * can call an API with. Review sync needs an OAuth grant + a concrete GBP
 * location ID, and the only way to get those is the consent flow this
 * component drives.
 *
 * Renders one of four states, derived from the connection status + URL params:
 *   disconnected      → "Connect Google Business Profile" button
 *   picking           → came back from consent (?google=connected) or
 *                       status=pending_location → account/location picker
 *   connected         → summary card + disconnect
 *   error states      → denied / invalid_state / exchange_failed banners,
 *                       plus the GBP-approval-pending notice (503)
 *
 * Props:
 *   onConnected() — called after a location is bound; parent advances the step.
 *   dark          — theme flag, same convention as the rest of the app.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { googleAPI } from "../../api/googleAPI.js";

const CALLBACK_ERRORS = {
  denied: "You cancelled the Google consent screen. Connect when you're ready.",
  invalid_state: "That connection attempt expired or was invalid. Please try again.",
  missing_code: "Google didn't return an authorization code. Please try again.",
  exchange_failed: "We couldn't complete the Google connection. Please try again.",
};

export default function GoogleConnect({ onConnected, dark = true }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [phase, setPhase] = useState("loading"); // loading | disconnected | picking | connected
  const [connection, setConnection] = useState(null);
  const [accounts, setAccounts] = useState(null); // [{account, locations}]
  const [selected, setSelected] = useState(null); // { accountId, accountName, locationId, locationName }
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null); // { tone: "error"|"info", text }

  // ── Theme tokens (matches the obsidian design system) ──────────────────────
  const card = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const textPrimary = dark ? "text-white" : "text-slate-900";
  const textMuted = "text-slate-500 dark:text-slate-400";
  const rowHover = dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50";
  const rowSelected = dark
    ? "bg-cyan-500/10 border-cyan-500/40"
    : "bg-cyan-50 border-cyan-300";

  // Declared BEFORE loadState, which calls it. Previously it sat after,
  // relying on effects running post-render to dodge the temporal dead zone.
  const loadLocations = async () => {
    try {
      const data = await googleAPI.getLocations();
      setAccounts(data);

      // One account, one location → preselect it. Most clinics.
      if (data.length === 1 && data[0].locations.length === 1) {
        const a = data[0].account;
        const l = data[0].locations[0];
        setSelected({
          accountId: a.id,
          accountName: a.name,
          locationId: l.id,
          locationName: l.name,
        });
      }
    } catch (err) {
      if (err.gbpNotApproved) {
        setBanner({
          tone: "info",
          text:
            "Your Google account is connected, but Google is still reviewing our " +
            "Business Profile API access. Location selection will unlock automatically " +
            "once that's approved — no action needed from you.",
        });
        setAccounts([]);
      } else {
        setBanner({ tone: "error", text: "Couldn't load your Google locations. Try refreshing." });
      }
    }
  };

  // ── Initial load: connection status + callback params ──────────────────────
  const loadState = useCallback(async () => {
    // Callback error params → show banner, then clean the URL.
    const cbParam = searchParams.get("google");
    if (cbParam && CALLBACK_ERRORS[cbParam]) {
      setBanner({ tone: "error", text: CALLBACK_ERRORS[cbParam] });
    }
    if (cbParam) {
      searchParams.delete("google");
      setSearchParams(searchParams, { replace: true });
    }

    try {
      const connections = await googleAPI.getConnections();
      const google = connections.find((c) => c.platform === "google") || null;
      setConnection(google);

      if (google?.status === "connected") {
        setPhase("connected");
      } else if (google?.status === "pending_location" || cbParam === "connected") {
        setPhase("picking");
        await loadLocations();
      } else {
        setPhase("disconnected");
      }
    } catch {
      setPhase("disconnected");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Awaited inside an async IIFE rather than called bare. A bare `loadState()`
  // reads to the linter — correctly — as "this effect body sets state", which
  // is the cascading-render pattern react-hooks/set-state-in-effect flags. The
  // IIFE makes the asynchrony explicit: nothing here sets state during the
  // effect's own execution.
  useEffect(() => {
    (async () => {
      await loadState();
    })();
  }, [loadState]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setBusy(true);
    try {
      const consentUrl = await googleAPI.startConnect();
      // Full navigation, not XHR — Google's consent screen must own the tab.
      window.location.href = consentUrl;
    } catch {
      toast.error("Couldn't start the Google connection. Please try again.");
      setBusy(false);
    }
  };

  const handleConfirmLocation = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const conn = await googleAPI.selectLocation(selected);
      setConnection(conn);
      setPhase("connected");
      toast.success(`Connected to ${conn.locationName || "your Google location"}`);
      onConnected?.(conn);
    } catch {
      toast.error("Couldn't save your location selection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await googleAPI.disconnect();
      setConnection(null);
      setAccounts(null);
      setSelected(null);
      setPhase("disconnected");
      toast.info("Google disconnected.");
    } catch {
      toast.error("Couldn't disconnect. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className={`w-full max-w-lg border rounded-3xl p-8 ${card}`}>
        <div className={`h-6 w-2/3 rounded-lg animate-pulse mb-4 ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
        <div className={`h-24 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
      </div>
    );
  }

  return (
    <div className={`w-full max-w-lg border rounded-3xl p-8 ${card}`}>
      <h1 className={`text-2xl font-black mb-2 ${textPrimary}`}>Connect Google Business</h1>
      <p className={`text-sm mb-6 ${textMuted}`}>
        Securely link your Google Business Profile so Kirtify can sync your reviews
        and, later, publish your replies. We never see your Google password.
      </p>

      {banner && (
        <div
          className={`p-4 rounded-2xl mb-6 text-xs leading-relaxed border ${
            banner.tone === "error"
              ? "bg-red-500/5 border-red-500/30 text-red-600 dark:text-red-400"
              : dark
                ? "bg-cyan-950/40 border-cyan-900/50 text-cyan-300"
                : "bg-cyan-50 border-cyan-100 text-cyan-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* ── Disconnected ──────────────────────────────────────────────────── */}
      {phase === "disconnected" && (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="w-full py-3.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          {/* Google "G" */}
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.3-5.35 4.3a5.8 5.8 0 1 1 0-11.6c1.45 0 2.77.55 3.78 1.45l2.2-2.2A8.9 8.9 0 1 0 12 21c4.6 0 8.55-3.35 9.35-7.9z" />
          </svg>
          {busy ? "Redirecting to Google…" : "Connect Google Business Profile"}
        </button>
      )}

      {/* ── Picking a location ────────────────────────────────────────────── */}
      {phase === "picking" && (
        <>
          <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${textMuted}`}>
            {accounts === null
              ? "Loading your locations…"
              : accounts.length === 0
                ? ""
                : "Which location is this clinic?"}
          </p>

          {accounts === null && (
            <div className={`h-32 rounded-2xl animate-pulse ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
          )}

          {accounts?.map(({ account, locations }) => (
            <div key={account.id} className="mb-4">
              {accounts.length > 1 && (
                <p className={`text-[11px] font-semibold mb-2 ${textMuted}`}>{account.name}</p>
              )}
              <div className="space-y-2">
                {locations.map((loc) => {
                  const isSelected = selected?.locationId === loc.id;
                  return (
                    <button
                      key={loc.id}
                      onClick={() =>
                        setSelected({
                          accountId: account.id,
                          accountName: account.name,
                          locationId: loc.id,
                          locationName: loc.name,
                        })
                      }
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isSelected ? rowSelected : `${dark ? "border-slate-800" : "border-slate-200"} ${rowHover}`
                      }`}
                    >
                      <p className={`text-sm font-bold ${textPrimary}`}>{loc.name}</p>
                      {loc.address && <p className={`text-xs mt-0.5 ${textMuted}`}>{loc.address}</p>}
                    </button>
                  );
                })}
                {locations.length === 0 && (
                  <p className={`text-xs ${textMuted}`}>
                    No locations found under this account. Make sure your business is verified
                    on Google Business Profile.
                  </p>
                )}
              </div>
            </div>
          ))}

          {accounts?.length > 0 && (
            <button
              onClick={handleConfirmLocation}
              disabled={!selected || busy}
              className="w-full mt-2 py-3.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white font-bold rounded-2xl transition-all active:scale-95"
            >
              {busy ? "Saving…" : "Confirm location"}
            </button>
          )}
        </>
      )}

      {/* ── Connected ─────────────────────────────────────────────────────── */}
      {phase === "connected" && connection && (
        <div>
          <div
            className={`p-4 rounded-2xl border mb-4 ${
              dark ? "bg-emerald-500/5 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <div className="min-w-0">
                <p className={`text-sm font-bold truncate ${textPrimary}`}>
                  {connection.locationName || "Google location connected"}
                </p>
                {connection.connectedEmail && (
                  <p className={`text-xs truncate ${textMuted}`}>
                    via {connection.connectedEmail}
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={busy}
            className={`text-xs font-bold transition-colors ${
              dark ? "text-slate-500 hover:text-red-400" : "text-slate-500 dark:text-slate-400 hover:text-red-500"
            }`}
          >
            {busy ? "Disconnecting…" : "Disconnect Google"}
          </button>
        </div>
      )}
    </div>
  );
}