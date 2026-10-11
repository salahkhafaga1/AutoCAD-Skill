"use strict";

/* `refs` command tests (node:test, no dependencies).
 *
 * Covers status output, skeleton init (global and project scopes),
 * dry-run, and the never-overwrite guarantee. Temp homes and projects
 * only — nothing touches the real machine. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, tempDir, fakeHome, writeJson, readJson, shaFile, rmrf } = require("./helpers");

function globalManifest(home) {
  return path.join(home, ".config", "autocad-skill", "references", "references.json");
}

function projectManifest(project) {
  return path.join(project, ".opencode", "references", "references.json");
}

test("refs status prints both roots and creates nothing", (t) => {
  const home = fakeHome();
  const cwd = tempDir("acs-cwd-");
  t.after(() => { rmrf(home); rmrf(cwd); });

  const r = runCli(["refs"], { cwd, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Global:/);
  assert.match(r.stdout, /Project:/);
  assert.match(r.stdout, /Active scope: global/);
  assert.strictEqual(fs.existsSync(path.join(home, ".config", "autocad-skill", "references")), false);
  assert.deepStrictEqual(fs.readdirSync(cwd), []);
});

test("refs init scaffolds a global skeleton and is a safe no-op rerun", (t) => {
  const home = fakeHome();
  const cwd = tempDir("acs-cwd-");
  t.after(() => { rmrf(home); rmrf(cwd); });
  const env = { AUTOCAD_SKILL_HOME: home };

  const first = runCli(["refs", "init"], { cwd, env });
  assert.strictEqual(first.status, 0, first.output);
  const manifest = globalManifest(home);
  assert.deepStrictEqual(readJson(manifest), { references: [] });
  assert.match(first.stdout, /Next steps:/);

  const hash = shaFile(manifest);
  const second = runCli(["refs", "init"], { cwd, env });
  assert.strictEqual(second.status, 0, second.output);
  assert.match(second.stdout, /already exists — left untouched/);
  assert.strictEqual(shaFile(manifest), hash, "rerun must not touch the manifest");
});

test("refs init honors --dry-run and --local scope", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });
  const env = { AUTOCAD_SKILL_HOME: home };

  const dry = runCli(["refs", "init", "--local", "--project", project, "--dry-run"], { env });
  assert.strictEqual(dry.status, 0, dry.output);
  assert.match(dry.stdout, /Dry run/);
  assert.strictEqual(fs.existsSync(projectManifest(project)), false);

  const local = runCli(["refs", "init", "--local", "--project", project], { env });
  assert.strictEqual(local.status, 0, local.output);
  assert.deepStrictEqual(readJson(projectManifest(project)), { references: [] });
  assert.strictEqual(fs.existsSync(globalManifest(home)), false, "local init must not touch global");
});

test("refs init never overwrites an existing manifest", (t) => {
  const home = fakeHome();
  const cwd = tempDir("acs-cwd-");
  t.after(() => { rmrf(home); rmrf(cwd); });
  const env = { AUTOCAD_SKILL_HOME: home };

  const lib = path.join(home, ".config", "autocad-skill", "references");
  const existing = { references: [{ id: "mine", path: "mine.pdf" }] };
  writeJson(path.join(lib, "references.json"), existing);
  const r = runCli(["refs", "init"], { cwd, env });
  assert.strictEqual(r.status, 0, r.output);
  assert.deepStrictEqual(readJson(path.join(lib, "references.json")), existing);
});

test("refs init leaves a corrupt manifest alone", (t) => {
  const home = fakeHome();
  const cwd = tempDir("acs-cwd-");
  t.after(() => { rmrf(home); rmrf(cwd); });

  const lib = path.join(home, ".config", "autocad-skill", "references");
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, "references.json"), "{ corrupt ", "utf8");
  const r = runCli(["refs", "init"], { cwd, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.strictEqual(fs.readFileSync(path.join(lib, "references.json"), "utf8"), "{ corrupt ");
});

test("doctor reports the reference toolchain without failing", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Reference tools/);
  assert.match(r.stdout, /pypdf \(extraction\)/);
  assert.match(r.stdout, /Tesseract \(OCR\)/);
});
