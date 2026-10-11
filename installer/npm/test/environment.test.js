"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, tempDir, treeHashes, rmrf, fakeHome, globalTargetOf } = require("./helpers");

test("--project pointing at a missing directory is an error", () => {
  const missing = path.join(tempDir(), "does-not-exist");
  const r = runCli(["install", "--project", missing]);
  assert.strictEqual(r.status, 1);
  assert.match(r.output, /--project path is not an existing directory/);
});

test("--project pointing at a file is an error", (t) => {
  const dir = tempDir();
  t.after(() => rmrf(dir));
  const file = path.join(dir, "a-file.txt");
  fs.writeFileSync(file, "x");

  const r = runCli(["install", "--project", file]);
  assert.strictEqual(r.status, 1);
  assert.match(r.output, /--project path is not an existing directory/);
});

test("--project without a value is an error", () => {
  const r = runCli(["install", "--project"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--project requires a directory/);
});

test("no command defaults to install into OpenCode's global skills source", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli([], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(
    fs.existsSync(path.join(globalTargetOf(home), "SKILL.md")),
    "installed into <home>/.config/opencode/skills/engineering-cad"
  );
  assert.strictEqual(fs.existsSync(path.join(project, ".opencode")), false, "project left untouched");
  assert.match(r.stdout, /Skill ID: engineering-cad \(mention @engineering-cad/);
});

test("a project with no opencode.json still installs, with a warning", (t) => {
  const project = makeProject(null); // no config file at all
  t.after(() => rmrf(project));

  const r = runCli(["install", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /OpenCode not detected|no opencode\.json/);
  assert.ok(fs.existsSync(path.join(project, ".opencode", "skills", "engineering-cad", "SKILL.md")));
});

test("an invalid AUTOCAD_SKILL_SOURCE falls back instead of crashing", (t) => {
  const project = makeProject();
  const empty = tempDir("acs-empty-");
  t.after(() => { rmrf(project); rmrf(empty); });

  const r = runCli(["install", "--project", project], { env: { AUTOCAD_SKILL_SOURCE: empty } });
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(fs.existsSync(path.join(project, ".opencode", "skills", "engineering-cad", "SKILL.md")));
});

test("all activity stays inside the requested project", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const before = treeHashes(project);
  runCli(["install", "--project", project]);
  const after = treeHashes(project);

  // Only additions under the project; nothing outside it was created by us.
  const added = Object.keys(after).filter((k) => !(k in before));
  assert.ok(added.length > 0);
  for (const f of added) {
    assert.ok(
      f.startsWith(".opencode/skills/") || f === "opencode.json",
      `unexpected file written outside the skill directory: ${f}`
    );
  }
  // opencode.json itself must be untouched.
  assert.strictEqual(after["opencode.json"], before["opencode.json"]);
});
