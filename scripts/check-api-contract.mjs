#!/usr/bin/env node
//
// scripts/check-api-contract.mjs
//
// Fails if the SPA calls an endpoint the API does not serve.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The frontend and backend are separate packages with separate test suites,
// and nothing between them is typed. A route renamed on one side and not the
// other produces no compile error, no lint error and no failing test — it
// produces a 404 the user meets in production, usually on a feature nobody
// exercised that release. This is the cheapest possible guard against that
// class of drift: no database, no servers, no dependencies, ~50ms.
//
// ── WHAT IT DOES AND DOES NOT ENFORCE ───────────────────────────────────────
// A frontend call with no matching backend route is a FAILURE — someone is
// going to get a 404.
//
// A backend route with no frontend caller is only REPORTED. Plenty of routes
// are legitimately never called by the SPA: OAuth callbacks the browser is
// redirected to, Paddle and Twilio webhooks, and /auth/refresh-token, which
// the axios interceptor calls through a raw axios client rather than the
// shared instance. Failing on those would train people to ignore this script.
//
// ── ON PARSING JAVASCRIPT WITH REGEX ────────────────────────────────────────
// Yes. The alternative is a parser dependency in a check whose whole appeal is
// having none. The patterns below are matched to how this codebase is actually
// written — `router.get("/x")`, `router.put ("/x")` with the space this repo
// sometimes uses for alignment, `axiosInstance.post(`/x/${id}`)` — and the
// script fails loudly if it finds implausibly few of either, so a silent
// parse failure cannot masquerade as a clean run.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendSrc = path.join(root, "backend", "src");
const frontendSrc = path.join(root, "frontend", "src");

// A route is only as unique as its shape: /reviews/:id and /reviews/:reviewId
// are the same endpoint, and the SPA writes both as an interpolation.
const shape = (p) => p.replace(/:[A-Za-z_]\w*/g, ":P").replace(/\/+$/, "") || "/";

// ── Backend: mount prefixes from app.js, then routes from each router ───────
function backendRoutes() {
  const app = fs.readFileSync(path.join(backendSrc, "app.js"), "utf8");

  // import authRoutes from "./routes/auth.routes.js"  →  { authRoutes: "auth.routes.js" }
  const importedAs = {};
  for (const m of app.matchAll(/import\s+(\w+)\s+from\s+["'`]\.\/routes\/([\w.]+)\.js["'`]/g)) {
    importedAs[m[1]] = `${m[2]}.js`;
  }

  // app.use("/api/v1/auth", authRoutes) — with any number of middlewares before
  // the router, e.g. app.use("/api/v1/billing", express.raw(...), billingRoutes)
  const prefixOf = {};
  for (const m of app.matchAll(/app\.use\(\s*["'`]([^"'`]+)["'`]\s*,[\s\S]*?(\w+)\s*\)/g)) {
    if (importedAs[m[2]]) prefixOf[importedAs[m[2]]] = m[1];
  }

  const routes = new Set();

  for (const file of fs.readdirSync(path.join(backendSrc, "routes"))) {
    const src = fs.readFileSync(path.join(backendSrc, "routes", file), "utf8");
    const prefix = prefixOf[file];
    if (prefix === undefined) continue; // a router nobody mounted
    for (const m of src.matchAll(/router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]*)["'`]/g)) {
      const sub = m[2];
      routes.add(`${m[1].toUpperCase()} ${shape(sub === "/" ? prefix : prefix + sub)}`);
    }
  }

  // Routes hung directly off the app, e.g. app.get("/health", …)
  for (const m of app.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
    routes.add(`${m[1].toUpperCase()} ${shape(m[2])}`);
  }

  return routes;
}

// ── Frontend: every axiosInstance call, plus the raw-axios refresh ──────────
function frontendCalls() {
  const calls = new Map(); // "METHOD /path" → Set of files, for a useful error

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) visit(full);
    }
  };

  const visit = (file) => {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    for (const m of src.matchAll(/axiosInstance\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\2/g)) {
      // Strip the query string, then collapse `${…}` interpolations to a param.
      const p = m[3].split("?")[0].replace(/\$\{[^}]*\}/g, ":P");
      const key = `${m[1].toUpperCase()} ${shape("/api/v1" + p)}`;
      if (!calls.has(key)) calls.set(key, new Set());
      calls.get(key).add(rel);
    }
  };

  walk(frontendSrc);
  return calls;
}

// ── Run ─────────────────────────────────────────────────────────────────────
const routes = backendRoutes();
const calls = frontendCalls();

// A parse that silently matched almost nothing would "pass" while checking
// nothing at all, which is worse than failing.
const FLOOR = { routes: 40, calls: 30 };
if (routes.size < FLOOR.routes || calls.size < FLOOR.calls) {
  console.error(
    `✗ api-contract: parsed implausibly little — ${routes.size} routes, ${calls.size} calls.\n` +
      `  Expected at least ${FLOOR.routes} and ${FLOOR.calls}. The source layout probably\n` +
      `  changed and the patterns in this script need updating; it is not reporting\n` +
      `  a clean contract.`,
  );
  process.exit(1);
}

const missing = [...calls.keys()].filter((c) => !routes.has(c)).sort();
const uncalled = [...routes].filter((r) => !calls.has(r)).sort();

console.log(`api-contract: ${routes.size} backend routes, ${calls.size} distinct frontend calls`);

if (uncalled.length) {
  console.log(`\n  Not called by the SPA (informational — webhooks, OAuth callbacks, the`);
  console.log(`  interceptor's own refresh, and anything genuinely unused):`);
  for (const r of uncalled) console.log(`    · ${r}`);
}

if (missing.length) {
  console.error(`\n✗ ${missing.length} frontend call(s) have no matching backend route:\n`);
  for (const c of missing) {
    console.error(`    ${c}`);
    for (const f of calls.get(c)) console.error(`      called from ${f}`);
  }
  console.error(`\n  Each of these is a 404 waiting for a user. Either the route was renamed`);
  console.error(`  on one side only, or the call is reaching for something never built.`);
  process.exit(1);
}

console.log("\n✓ every frontend call resolves to a backend route");
