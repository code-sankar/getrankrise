// frontend/src/components/settings/TeamTab.jsx
//
// The Settings → Team screen: who has access, and how someone new gets it.
//
// This is the UI for a permission model that has been real since migration 0015
// and, until now, reachable only by running a shell script against production.
//
// ── The controls hidden here are hidden as a COURTESY ───────────────────────
// Every mutation on this screen is restrictTo("owner") server-side. Hiding the
// buttons from staff is presentation — it keeps the screen honest about what
// this person can do — and the server rejects the calls independently if
// anything gets past it. `canInvite` comes from the API rather than being
// re-derived from the role here, so there is one source of truth for the rule.

import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import membersAPI from "../../api/membersAPI.js";
import { messageFrom } from "../../api/accountAPI.js";

const RoleBadge = ({ role, dark }) => (
  <span
    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
      role === "owner"
        ? dark
          ? "bg-indigo-500/15 text-indigo-300"
          : "bg-indigo-50 text-indigo-700"
        : dark
          ? "bg-slate-700/50 text-slate-300"
          : "bg-slate-100 text-slate-600"
    }`}
  >
    {role}
  </span>
);

export default function TeamTab({ dark }) {
  const me = useSelector((s) => s.auth.user);

  const [state, setState] = useState({ status: "loading", error: "" });
  const [team, setTeam] = useState({ members: [], invitations: [], canInvite: false });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviting, setInviting] = useState(false);
  // Tracks whichever row has a request in flight, so only that row's buttons
  // disable rather than the whole table freezing.
  const [busyId, setBusyId] = useState(null);

  // Every mutation below re-reads the team rather than patching local state:
  // the server owns the last-owner rule and the pending-invitation set, so a
  // client-side splice would show a list the server disagrees with the moment
  // a rule fires. Bumping this key is how they ask for that re-read.
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  // The fetch lives INSIDE the effect with a cancellation flag, rather than in
  // a useCallback the effect invokes. Two reasons: setState reached
  // synchronously from an effect body is a cascading-render hazard (and an
  // eslint error), and a response that lands after the tab has been switched
  // away must not write to an unmounted component.
  useEffect(() => {
    let cancelled = false;

    membersAPI
      .list()
      .then((data) => {
        if (cancelled) return;
        setTeam(data);
        setState({ status: "ready", error: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: messageFrom(err, "Couldn't load your team right now."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const invite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;

    setInviting(true);
    try {
      const res = await membersAPI.invite({ email, role: inviteRole });
      toast.success(res?.message || `Invitation sent to ${email}.`);
      setInviteEmail("");
      setInviteRole("staff");
      reload();
    } catch (err) {
      // The server writes a specific sentence for every refusal worth having
      // one — already a member, belongs to another clinic, email not
      // configured. Flattening those into "failed" would throw away the only
      // part the owner can act on.
      toast.error(messageFrom(err, "Couldn't send that invitation."));
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (invitation) => {
    if (!confirm(`Revoke the invitation to ${invitation.email}?`)) return;
    setBusyId(invitation.id);
    try {
      await membersAPI.revokeInvitation(invitation.id);
      toast.success(`Invitation to ${invitation.email} revoked.`);
      reload();
    } catch (err) {
      toast.error(messageFrom(err, "Couldn't revoke that invitation."));
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (member, role) => {
    setBusyId(member.userId);
    try {
      const res = await membersAPI.updateRole(member.userId, role);
      toast.success(res?.message || "Role updated.");
      reload();
    } catch (err) {
      toast.error(messageFrom(err, "Couldn't change that role."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member) => {
    if (
      !confirm(
        `Remove ${member.name} from this clinic? They'll be signed out immediately and lose all access.`,
      )
    )
      return;
    setBusyId(member.userId);
    try {
      const res = await membersAPI.remove(member.userId);
      toast.success(res?.message || `${member.name} removed.`);
      reload();
    } catch (err) {
      toast.error(messageFrom(err, "Couldn't remove that person."));
    } finally {
      setBusyId(null);
    }
  };

  const isOwner = team.yourRole === "owner";
  const inputCls = dark
    ? "bg-slate-950 border-slate-800 text-white placeholder-slate-600"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400";

  if (state.status === "loading") {
    return (
      <div className="space-y-3 animate-pulse" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-14 rounded-xl ${dark ? "bg-slate-800" : "bg-slate-100"}`} />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-400 mb-4">{state.error}</p>
        <button
          type="button"
          onClick={reload}
          className="text-sm font-bold text-indigo-500 hover:text-indigo-400"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Members ─────────────────────────────────────────────────────── */}
      <div>
        <h3 className={`text-sm font-bold mb-1 ${dark ? "text-white" : "text-slate-900"}`}>
          People with access
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Owners can manage billing and the team. Team members can do everything
          else — reviews, replies, requests and campaigns.
        </p>

        <div className={`rounded-xl border divide-y ${dark ? "border-slate-800 divide-slate-800" : "border-slate-200 divide-slate-100"}`}>
          {team.members.map((m) => {
            const isMe = m.userId === me?.id;
            const busy = busyId === m.userId;
            return (
              <div key={m.userId} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>
                      {m.name}
                    </span>
                    <RoleBadge role={m.role} dark={dark} />
                    {isMe && <span className="text-[10px] text-slate-500 font-medium">(you)</span>}
                    {!m.emailVerified && (
                      <span className="text-[10px] text-amber-500 font-semibold">
                        email unconfirmed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{m.email}</p>
                </div>

                {/* Owner-only, and never on your own row — the server refuses
                    both, so showing them would only produce an error toast. */}
                {isOwner && !isMe && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => changeRole(m, e.target.value)}
                      aria-label={`Role for ${m.name}`}
                      className={`text-xs font-semibold rounded-lg border px-2 py-1.5 disabled:opacity-50 ${inputCls}`}
                    >
                      <option value="staff">Team member</option>
                      <option value="owner">Owner</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      disabled={busy}
                      className="text-xs font-bold text-red-500 hover:text-red-400 px-2 py-1.5 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Pending invitations ─────────────────────────────────────────── */}
      {team.invitations.length > 0 && (
        <div>
          <h3 className={`text-sm font-bold mb-3 ${dark ? "text-white" : "text-slate-900"}`}>
            Pending invitations
          </h3>
          <div className={`rounded-xl border divide-y ${dark ? "border-slate-800 divide-slate-800" : "border-slate-200 divide-slate-100"}`}>
            {team.invitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${dark ? "text-slate-200" : "text-slate-800"}`}>
                      {inv.email}
                    </span>
                    <RoleBadge role={inv.role} dark={dark} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Invited{inv.invitedByName ? ` by ${inv.invitedByName}` : ""} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => revoke(inv)}
                    disabled={busyId === inv.id}
                    className="text-xs font-bold text-red-500 hover:text-red-400 px-2 py-1.5 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Invite ──────────────────────────────────────────────────────── */}
      {isOwner && (
        <div>
          <h3 className={`text-sm font-bold mb-1 ${dark ? "text-white" : "text-slate-900"}`}>
            Invite someone
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            They'll get an email with a link to join. It expires in 14 days.
          </p>

          {/* An invitation IS an email, so without a mailer the server refuses
              rather than creating a row nobody can ever accept. Say so here
              instead of letting the owner discover it by clicking. */}
          {!team.emailConfigured ? (
            <p className="text-sm text-amber-500">
              Invitations need email to be configured on the server. Contact
              support and we'll switch it on.
            </p>
          ) : (
            <form onSubmit={invite} className="flex flex-wrap gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@yourclinic.com"
                aria-label="Email address to invite"
                className={`flex-1 min-w-[220px] rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-indigo-500 ${inputCls}`}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                aria-label="Role"
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium outline-none focus:border-indigo-500 ${inputCls}`}
              >
                <option value="staff">Team member</option>
                <option value="owner">Owner</option>
              </select>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </form>
          )}

          {inviteRole === "owner" && team.emailConfigured && (
            <p className="text-xs text-amber-500 mt-3">
              Owners can change the plan, cancel the subscription and manage the
              team. Only invite someone as an owner if you mean it.
            </p>
          )}
        </div>
      )}

      {!isOwner && (
        <p className="text-xs text-slate-500">
          Only the clinic owner can invite or remove people. Ask them if you need
          someone added.
        </p>
      )}
    </div>
  );
}
