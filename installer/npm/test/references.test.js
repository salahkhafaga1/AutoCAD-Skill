"use strict";

/* P0.1 reference-library tests (node:test, no dependencies).
 *
 * Covers manifest schema validation, global/project-local discovery, path
 * safety, and read-only `doctor` diagnostics. Every case runs against
 * throwaway temp directories with their own AUTOCAD_SKILL_HOME — no test
 * touches the repository, the real machine home, or the real reference
 * PDFs in D:\AI\skill\Ref (fixtures below are tiny synthetic text files;
 * P0.1 never reads file contents, only existence/readability).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, tempDir, fakeHome, writeJson, rmrf } = require("./helpers");
const refs = require("../lib/references");

/* Global library root under a throwaway home (mirrors the implementation's
 * home/XDG convention; baseEnv strips XDG_CONFIG_HOME so this is exact). */
function globalLibDir(home) {
  return path.join(home, ".config", "autocad-skill", "references");
}

function projectLibDir(project) {
  return path.join(project, ".opencode", "references");
}

/* Synthetic reference file. Content is arbitrary text — P0.1 probes only
 * existence and readability, never parses or indexes file contents. */
function fakeRef(dir, name, content = "synthetic fixture, not a real PDF\n") {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return p;
}

function writeManifest(libDir, obj) {
  writeJson(path.join(libDir, "references.json"), obj);
}

function writeRawManifest(libDir, text) {
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, "references.json"), text, "utf8");
}

/* ------------------------------------------------------------------ */
/* Unit: manifest schema                                               */
/* ------------------------------------------------------------------ */

test("validateManifest accepts a minimal valid manifest", () => {
  const r = refs.validateManifest({ references: [{ id: "ecp203-2025", path: "ECP203.pdf" }] });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.entries.length, 1);
  assert.strictEqual(r.entries[0].id, "ecp203-2025");
});

test("validateManifest accepts all optional metadata fields", () => {
  const r = refs.validateManifest({
    references: [{
      id: "tsbt-2e", path: "ts.pdf", title: "Time-Saver", author: "De Chiara",
      edition: "2nd", year: 1990, jurisdiction: "US", kind: "handbook",
    }],
  });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.entries[0].meta.kind, "handbook");
  assert.strictEqual(r.entries[0].meta.year, 1990);
});

test("validateManifest rejects missing fields and invalid types", () => {
  const r = refs.validateManifest({
    references: [
      { path: "a.pdf" },
      { id: "b", path: 42 },
      { id: "Bad_ID!", path: "b.pdf" },
      { id: "c", path: "c.pdf", kind: "law" },
      { id: "d", path: "d.pdf", year: "2025" },
      { id: "e", path: "e.pdf", title: 7 },
      "not-an-object",
    ],
  });
  assert.ok(r.errors.length >= 7, JSON.stringify(r.errors));
  assert.match(r.errors.join("\n"), /duplicate|missing|must be|must match|must be one of/m);
});

test("validateManifest rejects non-object roots and non-array references", () => {
  for (const bad of [null, [], "x", {}, { references: {} }, { references: "x" }]) {
    const r = refs.validateManifest(bad);
    assert.ok(r.errors.length >= 1, JSON.stringify(bad));
    assert.strictEqual(r.entries.length, 0);
  }
});

test("validateManifest flags duplicate ids within one manifest", () => {
  const r = refs.validateManifest({
    references: [
      { id: "dup", path: "a.pdf" },
      { id: "dup", path: "b.pdf" },
    ],
  });
  assert.match(r.errors.join("\n"), /duplicate id "dup"/);
});

test("validateManifest warns (not errors) on unknown fields", () => {
  const r = refs.validateManifest({
    references: [{ id: "a", path: "a.pdf", ocr: true }],
  });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.warnings.length, 1);
  assert.match(r.warnings[0], /unknown field "ocr"/);
});

/* ------------------------------------------------------------------ */
/* Unit: path safety                                                   */
/* ------------------------------------------------------------------ */

test("resolveRefPath keeps relative paths inside the root", () => {
  const root = path.join("C:", "lib");
  assert.strictEqual(refs.resolveRefPath(root, "a.pdf").ok, true);
  assert.strictEqual(refs.resolveRefPath(root, "sub/dir.pdf").ok, true);
  assert.strictEqual(refs.resolveRefPath(root, "sub/../a.pdf").ok, true);
});

test("resolveRefPath rejects traversal outside the root", () => {
  const root = path.join("C:", "lib");
  for (const evil of ["../evil.pdf", "..\\evil.pdf", "../../x.pdf", "sub/../../evil.pdf"]) {
    const r = refs.resolveRefPath(root, evil);
    assert.strictEqual(r.ok, false, evil);
    assert.strictEqual(r.reason, "path escapes the library root");
  }
});

test("resolveRefPath allows absolute paths but flags them external", () => {
  const root = path.join("C:", "lib");
  const inside = refs.resolveRefPath(root, path.join("C:", "lib", "a.pdf"));
  assert.strictEqual(inside.ok, true);
  assert.strictEqual(inside.external, true);
  const outside = refs.resolveRefPath(root, path.join("D:", "other", "b.pdf"));
  assert.strictEqual(outside.ok, true);
  assert.strictEqual(outside.external, true);
});

/* ------------------------------------------------------------------ */
/* CLI: doctor diagnostics                                             */
/* ------------------------------------------------------------------ */

test("doctor with both libraries absent reports not-configured and creates nothing", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(global\).*not configured/);
  assert.match(r.stdout, /Reference library \(project\).*not configured/);
  assert.strictEqual(fs.existsSync(globalLibDir(home)), false, "doctor must not create library dirs");
  assert.strictEqual(fs.existsSync(projectLibDir(project)), false, "doctor must not create library dirs");
});

test("doctor reports an empty but valid library", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  writeManifest(globalLibDir(home), { references: [] });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(global\).*0 references registered — library is empty/);
});

test("doctor reports a missing manifest as not-configured", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  fs.mkdirSync(projectLibDir(project), { recursive: true });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(project\).*no references\.json/);
});

test("doctor passes a valid manifest with relative and external files", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const lib = globalLibDir(home);
  fakeRef(lib, "handbook-a.pdf");
  const external = fakeRef(tempDir("acs-ext-"), "external-b.pdf");
  writeManifest(lib, {
    references: [
      { id: "handbook-a", path: "handbook-a.pdf", title: "Synthetic A", kind: "handbook" },
      { id: "external-b", path: external, kind: "educational" },
    ],
  });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(global\).*2 reference\(s\), all files present \(1 external\)/);
});

test("doctor warns on malformed JSON without failing", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  writeRawManifest(globalLibDir(home), "{ not json ");
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(global\).*invalid manifest/);
});

test("doctor warns on missing required fields and lists the problem", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  writeManifest(projectLibDir(project), { references: [{ id: "no-path" }, { id: "Bad Id", path: "x.pdf" }] });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(project\).*invalid manifest/);
});

test("doctor names missing reference files", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const lib = projectLibDir(project);
  writeManifest(lib, { references: [{ id: "gone", path: "gone.pdf" }] });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(project\).*gone: missing/);
});

test("doctor reports duplicate ids within one library", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const lib = globalLibDir(home);
  fakeRef(lib, "a.pdf");
  writeManifest(lib, {
    references: [{ id: "dup", path: "a.pdf" }, { id: "dup", path: "a.pdf" }],
  });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(global\).*duplicate id "dup"/);
});

test("doctor reports conflicting ids across global and project libraries", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const glib = globalLibDir(home);
  const plib = projectLibDir(project);
  fakeRef(glib, "g.pdf");
  fakeRef(plib, "p.pdf");
  writeManifest(glib, { references: [{ id: "shared", path: "g.pdf", edition: "1st" }] });
  writeManifest(plib, { references: [{ id: "shared", path: "p.pdf", edition: "2nd" }] });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference conflicts.*duplicate id.*"shared" \(global \+ project\)/);
});

test("doctor resolves a safe project-local reference", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const plib = projectLibDir(project);
  fakeRef(plib, "local-code.pdf");
  writeManifest(plib, {
    references: [{ id: "local-code", path: "local-code.pdf", kind: "code", jurisdiction: "Test" }],
  });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(project\).*1 reference\(s\), all files present/);
  assert.match(r.stdout, /Reference library \(global\).*not configured/);
});

test("doctor rejects path traversal in a manifest", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const plib = projectLibDir(project);
  writeManifest(plib, { references: [{ id: "evil", path: "../outside.pdf" }] });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(project\).*evil: path escapes the library root/);
});

test("doctor handles Windows separators and drive-letter externals",
  { skip: process.platform !== "win32" && "requires Windows drive-letter paths" },
  (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const plib = projectLibDir(project);
  fakeRef(path.join(plib, "sub"), "win.pdf");
  const externalDir = tempDir("acs-ext-");
  const externalAbs = fakeRef(externalDir, "abs.pdf");
  assert.ok(/^[A-Za-z]:\\/.test(externalAbs), "test needs a drive-letter absolute path");
  writeManifest(plib, {
    references: [
      { id: "win-sep", path: "sub\\win.pdf" },
      { id: "win-abs", path: externalAbs },
    ],
  });
  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference library \(project\).*2 reference\(s\), all files present \(1 external\)/);
});

test("install and doctor keep working with no reference library configured", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install", "--project", project], { env }).status, 0);
  const r = runCli(["doctor", "--project", project], { env });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Result: no errors\./);
});
