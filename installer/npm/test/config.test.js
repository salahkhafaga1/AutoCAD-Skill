"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, writeJson, readJson, rmrf } = require("./helpers");

test("--register appends one skills entry and preserves every other key", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const cfgPath = path.join(project, "opencode.json");
  const before = readJson(cfgPath);

  const r = runCli(["install", "--project", project, "--register", "--yes"]);
  assert.strictEqual(r.status, 0, r.output);

  const after = readJson(cfgPath);
  // Unrelated config is untouched.
  assert.strictEqual(after.theme, before.theme);
  assert.deepStrictEqual(after.mcp, before.mcp);
  assert.strictEqual(after.skills.length, before.skills.length + 1, "exactly one entry added");
  // Pre-existing entry is preserved verbatim.
  assert.ok(after.skills.includes(before.skills[0]), "existing skills entry kept");
  // Backup of the original config exists.
  assert.ok(fs.existsSync(`${cfgPath}.autocad-skill-backup`), "config backup created");
});

test("--register without --yes cannot change the config non-interactively", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const cfgPath = path.join(project, "opencode.json");
  const before = fs.readFileSync(cfgPath, "utf8");

  const r = runCli(["install", "--project", project, "--register"]);
  assert.strictEqual(r.status, 2, r.output);
  assert.match(r.output, /Confirmation required/);
  assert.strictEqual(fs.readFileSync(cfgPath, "utf8"), before, "config untouched");
  assert.strictEqual(fs.existsSync(path.join(project, ".opencode")), false, "no skill files written either");
});

test("--register is idempotent", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const cfgPath = path.join(project, "opencode.json");
  assert.strictEqual(runCli(["install", "--project", project, "--register", "--yes"]).status, 0);
  const first = readJson(cfgPath).skills.length;

  const again = runCli(["install", "--project", project, "--register", "--yes"]);
  assert.strictEqual(again.status, 0, again.output);
  assert.match(again.stdout, /already lists this skill/);
  assert.strictEqual(readJson(cfgPath).skills.length, first, "no duplicate entry");
});

test("refuses to modify a skills value that is not an array", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const cfgPath = path.join(project, "opencode.json");
  const before = { theme: "dark", skills: "not-an-array" };
  writeJson(cfgPath, before);
  const bytes = fs.readFileSync(cfgPath, "utf8");

  const r = runCli(["install", "--project", project, "--register", "--yes"]);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /not an array/);
  assert.strictEqual(fs.readFileSync(cfgPath, "utf8"), bytes, "config untouched");
});

test("an unreadable config stops install and update with an error", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const cfgPath = path.join(project, "opencode.json");
  fs.writeFileSync(cfgPath, "{ this is not json ");

  const inst = runCli(["install", "--project", project]);
  assert.strictEqual(inst.status, 1, inst.output);
  assert.match(inst.output, /cannot be read/);
  assert.strictEqual(fs.existsSync(path.join(project, ".opencode")), false, "nothing written");

  const upd = runCli(["update", "--project", project]);
  assert.strictEqual(upd.status, 1, upd.output);
  assert.match(upd.output, /cannot be read/);
});

test("opencode.json with no skills array still auto-discovers (no write)", (t) => {
  const project = makeProject({ theme: "light" });
  t.after(() => rmrf(project));

  const cfgPath = path.join(project, "opencode.json");
  const before = fs.readFileSync(cfgPath, "utf8");

  const r = runCli(["install", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.strictEqual(fs.readFileSync(cfgPath, "utf8"), before, "config not rewritten");
  assert.match(r.stdout, /auto-discovery/);
});
