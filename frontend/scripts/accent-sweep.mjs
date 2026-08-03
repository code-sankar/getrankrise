#!/usr/bin/env node
// frontend/scripts/accent-sweep.mjs
//
// Mechanical half of the Step 6 design sweep: indigo/blue → cyan across
// frontend/src.
//
//   node scripts/accent-sweep.mjs            # DRY RUN — prints what would change
//   node scripts/accent-sweep.mjs --write    # actually rewrite files
//   node scripts/accent-sweep.mjs --write --include-landing
//
// ── WHY A SCRIPT AND NOT A FIND-AND-REPLACE ─────────────────────────────────
// Three reasons a blind `sed s/indigo/cyan/g` gets this wrong:
//
//   1. BRAND COLOURS ARE DATA. #4285F4 (Google), #1877F2 (Facebook),
//      #D32323 (Yelp) are how a user identifies a platform at a glance in a
//      unified feed. Recolouring them to cyan destroys the one signal the
//      platform chip exists to carry. The hex allowlist below protects them,
//      and #1877F2 in particular would otherwise be caught by any naive
//      blue-hex rule.
//   2. NOT ALL BLUE IS ACCENT BLUE. `bg-blue-600` on a Settings toggle is the
//      accent and should move. The blue inside a gradient that is deliberately
//      cyan→blue should not. Handled by ordering: the gradient pair is
//      normalised first and then protected.
//   3. THE LANDING PAGE IS ITS OWN COMPOSITION. It uses #3b82f6 against a
//      #060a12 marketing palette with hand-tuned radial gradients. Swapping
//      its hexes mechanically produces something that technically matches the
//      app and looks wrong. Opt in with --include-landing, then look at it.
//
// After running: `grep -rn "indigo-" src/` should return nothing, and any
// remaining `blue-` should be inside a cyan→blue gradient or a brand colour.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const WRITE = process.argv.includes("--write");
const INCLUDE_LANDING = process.argv.includes("--include-landing");

const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);

// Paths never touched. theme.js owns PLATFORM deliberately; the landing page
// is opt-in.
const SKIP_PATHS = [
  "src/theme.js",
  ...(INCLUDE_LANDING ? [] : ["src/pages/landingPage"]),
];

// Hexes that must survive verbatim. Checked case-insensitively; any line
// containing one of these is left completely alone.
const PROTECTED_HEX = [
  "#4285f4", // Google
  "#1877f2", // Facebook
  "#d32323", // Yelp
  "#ff1a1a", // Yelp, the analyticsSlice variant
];

// ── Replacement table ────────────────────────────────────────────────────────
// Order matters: earlier rules win. The gradient normalisation runs first so
// its `blue-600` survives the generic blue rules below.
const RULES = [
  // 1. The one sanctioned gradient — normalise both spellings to the token's.
  [/from-indigo-500 to-blue-600/g, "from-cyan-500 to-blue-600"],
  [/from-indigo-600 to-blue-600/g, "from-cyan-500 to-blue-600"],
  [/shadow-indigo-500\//g, "shadow-cyan-500/"],

  // 2. Indigo → cyan, by shade.
  //    600 is the solid-fill shade in the old pages; the token uses 500 for
  //    fills so hover can be 400 without inverting the ramp on dark.
  [/\bindigo-950\b/g, "cyan-950"],
  [/\bindigo-900\b/g, "cyan-900"],
  [/\bindigo-800\b/g, "cyan-800"],
  [/\bindigo-700\b/g, "cyan-600"],
  [/\bindigo-600\b/g, "cyan-500"],
  [/\bindigo-500\b/g, "cyan-500"],
  [/\bindigo-400\b/g, "cyan-400"],
  [/\bindigo-300\b/g, "cyan-300"],
  [/\bindigo-200\b/g, "cyan-200"],
  [/\bindigo-100\b/g, "cyan-100"],
  [/\bindigo-50\b/g, "cyan-50"],

  // 3. Accent blue → cyan. Runs after the gradient rule above.
  [/\bblue-700\b/g, "cyan-600"],
  [/\bblue-600\b/g, "cyan-500"],
  [/\bblue-500\b/g, "cyan-500"],
  [/\bblue-400\b/g, "cyan-400"],
  [/\bblue-300\b/g, "cyan-300"],
  [/\bblue-100\b/g, "cyan-100"],
  [/\bblue-50\b/g, "cyan-50"],

  // 4. Hex ramps. The indigo chart ramp in analyticsSlice, the dicebear avatar
  //    seed colours in AdminProfile, and the bare accent hexes.
  [/#6366f1/gi, "#06b6d4"],
  [/#818cf8/gi, "#22d3ee"],
  [/#a5b4fc/gi, "#67e8f9"],
  [/#c7d2fe/gi, "#a5f3fc"],
  [/#e0e7ff/gi, "#cffafe"],
  [/#4f46e5/gi, "#0891b2"],
  [/#3b82f6/gi, "#06b6d4"], // only reachable with --include-landing
  [/#60a5fa/gi, "#22d3ee"], // ditto

  // 5. CONTRAST FIX — runs last, on the output of rules 2 and 3.
  //    White on cyan-500 measures ~2.3:1 and fails WCAG AA. The connect cards
  //    already shipped that pairing, and rules 2–3 would have spread it to
  //    every ex-indigo button in the app. theme.js's accent.solid is
  //    near-black on cyan-400 (~11:1); these rules bring the literals in line.
  //
  //    Only catches same-line pairings, which is most of them (className
  //    strings). Afterwards, grep for stragglers:
  //        grep -rn "bg-cyan-500" src/ | grep "text-white"
  [
    /bg-cyan-500 hover:bg-cyan-400 text-white/g,
    "bg-cyan-400 hover:bg-cyan-300 text-slate-950",
  ],
  [
    /bg-cyan-500 text-white hover:bg-cyan-400/g,
    "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
  ],
  [/bg-cyan-500 text-white/g, "bg-cyan-400 text-slate-950"],
];

// ── Walk ─────────────────────────────────────────────────────────────────────
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const isSkipped = (file) => {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
  return SKIP_PATHS.some((p) => rel.startsWith(p));
};

const hasProtectedHex = (line) => {
  const lower = line.toLowerCase();
  return PROTECTED_HEX.some((h) => lower.includes(h));
};

// ── Run ──────────────────────────────────────────────────────────────────────
let filesChanged = 0;
let linesChanged = 0;
let protectedLines = 0;

for (const file of walk(ROOT)) {
  if (isSkipped(file)) continue;

  const original = fs.readFileSync(file, "utf8");
  const lines = original.split("\n");
  const hits = [];

  const next = lines.map((line, i) => {
    // A line carrying a brand hex is left entirely alone. Coarse on purpose:
    // "don't touch this line" is a rule you can verify by reading it.
    if (hasProtectedHex(line)) {
      protectedLines++;
      return line;
    }

    let out = line;
    for (const [pattern, replacement] of RULES) {
      out = out.replace(pattern, replacement);
    }
    if (out !== line) hits.push({ n: i + 1, before: line.trim(), after: out.trim() });
    return out;
  });

  if (hits.length === 0) continue;

  filesChanged++;
  linesChanged += hits.length;

  const rel = path.relative(process.cwd(), file);
  console.log(`\n${rel}  (${hits.length} line${hits.length === 1 ? "" : "s"})`);
  for (const h of hits.slice(0, 6)) {
    console.log(`  ${String(h.n).padStart(4)} - ${h.before.slice(0, 110)}`);
    console.log(`  ${"".padStart(4)} + ${h.after.slice(0, 110)}`);
  }
  if (hits.length > 6) console.log(`  … ${hits.length - 6} more`);

  if (WRITE) fs.writeFileSync(file, next.join("\n"), "utf8");
}

console.log(
  `\n${WRITE ? "Rewrote" : "Would rewrite"} ${filesChanged} file(s), ` +
    `${linesChanged} line(s). ${protectedLines} line(s) skipped for brand colours.` +
    (INCLUDE_LANDING ? "" : "\nLanding page excluded — rerun with --include-landing when you're ready to review it by eye.") +
    (WRITE ? "" : "\n\nDry run. Re-run with --write to apply.")
);
