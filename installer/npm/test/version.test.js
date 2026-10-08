"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { runCli, makeProject, readJson, PKG, REPO_SKILL, rmrf } = require("./helpers");

test("version prints exactly the specified lines", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const r = runCli(["version", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);

  const lines = r.stdout.trim().split(/\r?\n/);
  const skill = readJson(path.join(REPO_SKILL, "skill.json"));
  const pkg = readJson(path.join(PKG, "package.json"));

  assert.strictEqual(lines[0], "Engineering CAD Agent");
  assert.strictEqual(lines[1], `Skill version: ${skill.version}`);
  assert.strictEqual(lines[2], `Installer version: ${pkg.version}`);
  assert.strictEqual(lines[3], `Tool Contract version: ${skill.toolContractVersion}`);
  assert.strictEqual(lines.length, 4, `expected 4 lines, got: ${r.stdout}`);
});

test("version reports an installed copy only when it differs", async (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const install = runCli(["install", "--project", project]);
  assert.strictEqual(install.status, 0, install.output);

  // Same version -> still exactly 4 lines.
  const same = runCli(["version", "--project", project]);
  assert.strictEqual(same.status, 0, same.output);
  assert.strictEqual(same.stdout.trim().split(/\r?\n/).length, 4);

  // Simulate an older installed copy.
  const skillPath = path.join(project, ".opencode", "skills", "engineering_agent", "skill.json");
  const sj = readJson(skillPath);
  sj.version = "0.0.9";
  require("fs").writeFileSync(skillPath, JSON.stringify(sj, null, 2));

  const diff = runCli(["version", "--project", project]);
  assert.strictEqual(diff.status, 0, diff.output);
  assert.match(diff.stdout, /Installed skill version: 0\.0\.9/);
});

test("--help exits 0 and lists every command", () => {
  const r = runCli(["--help"]);
  assert.strictEqual(r.status, 0, r.output);
  for (const cmd of ["install", "update", "doctor", "version"]) {
    assert.match(r.stdout, new RegExp(`\\b${cmd}\\b`));
  }
  assert.match(r.stdout, /Exit codes:/);
});

test("unknown command exits non-zero with usage on stderr", () => {
  const r = runCli(["frobnicate"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /Unknown command: frobnicate/);
});

test("unknown option exits non-zero", () => {
  const r = runCli(["install", "--nope"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /Unknown option: --nope/);
});
