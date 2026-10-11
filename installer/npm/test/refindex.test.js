"use strict";

/* P0.4 reference-index status tests (node:test, no dependencies).
 *
 * Covers fresh/stale/missing/orphaned index reporting: pure-function checks
 * plus doctor wiring. Temp dirs and synthetic fixtures only — the real
 * reference PDFs are never touched. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, fakeHome, writeJson, shaFile, rmrf } = require("./helpers");
const refs = require("../lib/references");

function libDir(home) {
  return path.join(home, ".config", "autocad-skill", "references");
}

function fakePdf(dir, name) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "synthetic fixture\n", "utf8");
  return p;
}

function writeIndex(lib, id, sha) {
  const dir = path.join(lib, ".index", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "doc.json"),
    JSON.stringify({ ref_id: id, status: "indexed", sha256: sha,
                     extractor: { name: "ref_extract", version: "x" } }),
    "utf8"
  );
}

test("indexStatus reports fresh, stale, missing, and orphaned", (t) => {
  const home = fakeHome();
  t.after(() => rmrf(home));
  const lib = libDir(home);
  const a = fakePdf(lib, "a.pdf");
  const b = fakePdf(lib, "b.pdf");
  const c = fakePdf(lib, "c.pdf");
  fs.mkdirSync(path.join(lib, ".index", "orphan"), { recursive: true });
  writeJson(path.join(lib, "references.json"), { references: [
    { id: "a", path: "a.pdf" },
    { id: "b", path: "b.pdf" },
    { id: "c", path: "c.pdf" },
  ] });

  const rep = refs.inspectLibrary("global", lib);
  assert.strictEqual(rep.manifest.valid, true);
  // a: fresh (hash matches); b: stale (hash differs); c: missing (no record)
  writeIndex(lib, "a", shaFile(a));
  writeIndex(lib, "b", "0".repeat(64));

  const st = refs.indexStatus(rep);
  assert.deepStrictEqual(st.fresh, ["a"]);
  assert.deepStrictEqual(st.stale, ["b"]);
  assert.deepStrictEqual(st.missing, ["c"]);
  assert.deepStrictEqual(st.orphaned, ["orphan"]);
});

test("doctor reports index states without failing", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const lib = libDir(home);
  const a = fakePdf(lib, "a.pdf");
  fakePdf(lib, "b.pdf");
  fs.mkdirSync(path.join(lib, ".index", "orphan"), { recursive: true });
  writeJson(path.join(lib, "references.json"), { references: [
    { id: "a", path: "a.pdf" },
    { id: "b", path: "b.pdf" },
  ] });
  writeIndex(lib, "a", shaFile(a));

  const env = { AUTOCAD_SKILL_HOME: home };
  const r = runCli(["doctor", "--project", project], { env });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference index \(global\).*1 fresh/);
  assert.match(r.stdout, /not built: b/);
  assert.match(r.stdout, /orphaned: orphan/);
});

test("doctor reports a fully fresh index as passing", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const lib = libDir(home);
  const a = fakePdf(lib, "a.pdf");
  writeJson(path.join(lib, "references.json"), { references: [{ id: "a", path: "a.pdf" }] });
  writeIndex(lib, "a", shaFile(a));

  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference index \(global\).*1 fresh/);
  assert.match(r.stdout, /Result: no errors\./);
});
