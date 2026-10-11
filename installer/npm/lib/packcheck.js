"use strict";

/* Packaging guard patterns (P0.4): paths that must never ship in the npm
 * package. Pure functions only — no filesystem writes.
 *
 * Two tiers: WARN_PATTERNS keep the historical warn-only behavior (changing
 * them to errors would be a new behavior break); FAIL_PATTERNS are
 * reference-content paths (copyrighted PDFs, local indexes, manifests,
 * reference venvs) that fail the pack, because shipping those would leak
 * user documents or bloat the package.
 */

const WARN_PATTERNS = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)\.venv(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /\.(log|pyc|pyo)$/i,
  /(^|\/)\.env(\.|$)/,
];

const FAIL_PATTERNS = [
  /\.pdf$/i,
  /(^|\/)\.index(\/|$)/,
  /(^|\/)references\.json$/i,
  /(^|\/)\.venv-ref(\/|$)/,
];

function relOf(root, abs) {
  const path = require("path");
  return path.relative(root, abs).split(path.sep).join("/");
}

/** Scan `dir` recursively. Returns [{ rel, tier }] with tier "fail"|"warn". */
function findBanned(dir) {
  const fs = require("fs");
  const path = require("path");
  const out = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(dir, rel) : dir;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (FAIL_PATTERNS.some((re) => re.test(childRel))) {
        out.push({ rel: childRel, tier: "fail" });
        continue;
      }
      if (WARN_PATTERNS.some((re) => re.test(childRel))) {
        out.push({ rel: childRel, tier: "warn" });
        continue;
      }
      if (entry.isDirectory()) stack.push(childRel);
    }
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

module.exports = { WARN_PATTERNS, FAIL_PATTERNS, findBanned, relOf };
