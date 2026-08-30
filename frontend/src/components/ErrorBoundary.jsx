// frontend/src/components/ErrorBoundary.jsx
//
// What the user sees when a render throws.
//
// ── The gap this closes ─────────────────────────────────────────────────────
// React unmounts the entire tree when a render, lifecycle or effect throws and
// nothing catches it. With no boundary anywhere in the app, that produced a
// BLANK WHITE PAGE — no message, no navigation, no way back except knowing to
// reload. The error existed only in a console nobody had open.
//
// One boundary at the root is the right granularity here. Per-route boundaries
// would keep the sidebar alive around a broken page, which sounds better but
// mostly produces a half-app that looks functional and is not; the honest
// version is to say the screen failed and offer the two things that actually
// help.
//
// ── Why this is still a class component ─────────────────────────────────────
// componentDidCatch and getDerivedStateFromError have no hook equivalent. React
// 19 has not changed that. This is one of two remaining reasons to write a
// class, and it is not a style choice.

import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The frontend has no Sentry transport — the backend's observability module
    // is server-side only, and shipping a browser reporter is a larger decision
    // than this change should make on its own.
    //
    // What this does instead is make the failure LOUD and LOCATABLE where it
    // can be: a grouped console error carrying the component stack, which is
    // the piece that names the component that actually threw. That is what
    // turns a bug report of "the page went white" into something reproducible.
    console.error("[ErrorBoundary] a render failed", {
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
    });
  }

  handleReload = () => {
    // A full reload, not setState({ error: null }). Whatever threw did so from
    // application state, and re-rendering the same broken state just throws
    // again — a "try again" that reliably fails is worse than none.
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-screen w-full flex items-center justify-center bg-[#030712] text-white p-6"
      >
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl" aria-hidden="true">
              ⚠️
            </span>
          </div>

          <h1 className="text-xl font-bold mb-2">This screen ran into a problem</h1>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            Something went wrong while rendering this page. Your data is safe —
            nothing was lost.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:brightness-110 transition-all"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Go home
            </button>
          </div>

          {/* Development only. In production this would be noise to the user
              and detail to anyone else reading over their shoulder; the
              console keeps the full stack either way. */}
          {import.meta.env.DEV && (
            <pre className="mt-6 text-left text-[11px] leading-relaxed text-red-300/80 bg-red-500/5 border border-red-500/10 rounded-xl p-4 overflow-auto max-h-56">
              {this.state.error?.stack || String(this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
