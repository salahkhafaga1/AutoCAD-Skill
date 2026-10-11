"use strict";

/* P0.4 packaging-guard tests (node:test, no dependencies).
 *
 * Covers the pure findBanned() matcher against temp trees. The real
 * prepack run is out of scope for unit tests (it writes into the package
 * directory); what matters here is that reference content is classified
 * "fail" and historical entries stay "warn". */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { findBanned } = require("../lib/packcheck");
const { tempDir, rmrf } = require("./helpers");

function touch(root, rel) {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "x", "utf8");
}

test("reference content is classified fail", (t) => {
  const root = tempDir("acs-pack-");
  t.after(() => rmrf(root));
  touch(root, "docs/manual.pdf");
  touch(root, "skill/.index/abc/doc.json");
  touch(root, "lib/references.json");
  touch(root, ".venv-ref/Lib/site-packages/x.py");

  const fails = findBanned(root).filter((b) => b.tier === "fail").map((b) => b.rel).sort();
  assert.deepStrictEqual(fails, [
    ".venv-ref",
    "docs/manual.pdf",
    "lib/references.json",
    "skill/.index",
  ]);
});

test("historical entries stay warn-only", (t) => {
  const root = tempDir("acs-pack-");
  t.after(() => rmrf(root));
  touch(root, "node_modules/a/index.js");
  touch(root, "sub/__pycache__/b.pyc");
  touch(root, "sub/debug.log");

  const found = findBanned(root);
  assert.ok(found.length >= 3);
  assert.ok(found.every((b) => b.tier === "warn"), JSON.stringify(found));
});

test("a clean tree reports nothing", (t) => {
  const root = tempDir("acs-pack-");
  t.after(() => rmrf(root));
  touch(root, "bin/cli.js");
  touch(root, "skill/engineering_agent/SKILL.md");
  assert.deepStrictEqual(findBanned(root), []);
});

test("matching is case-insensitive for pdf extension", (t) => {
  const root = tempDir("acs-pack-");
  t.after(() => rmrf(root));
  touch(root, "scan.PDF");
  const found = findBanned(root);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].tier, "fail");
});
