"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, treeHashes, readJson, writeJson, REPO_SKILL, rmrf } = require("./helpers");

function targetOf(project) {
  return path.join(project, ".opencode", "skills", "engineering-cad");
}

test("fresh install copies the skill, writes a manifest, and reports success", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const r = runCli(["install", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);

  const target = targetOf(project);
  assert.ok(fs.existsSync(path.join(target, "SKILL.md")), "SKILL.md installed");
  assert.ok(fs.existsSync(path.join(target, "skill.json")), "skill.json installed");
  assert.ok(fs.existsSync(path.join(target, "rules")), "rules/ installed");

  const manifest = readJson(path.join(target, ".autocad-skill-manifest.json"));
  assert.strictEqual(manifest.skillId, "engineering-cad");
  assert.ok(Object.keys(manifest.files).length >= 30, "manifest records the installed files");

  assert.match(r.stdout, /Installation complete\./);
  assert.match(r.stdout, /Installation validated \(\d+ files\)/);
  // Default mode must not create backups or touch configuration.
  assert.ok(!fs.existsSync(path.join(project, ".autocad-skill-backups")), "no backup needed for a fresh install");
});

test("second install is a no-op and leaves every file untouched", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const before = treeHashes(targetOf(project));

  const again = runCli(["install", "--project", project]);
  assert.strictEqual(again.status, 0, again.output);
  assert.match(again.stdout, /Already installed/);
  assert.match(again.stdout, /no changes made/);

  assert.deepStrictEqual(treeHashes(targetOf(project)), before, "no file changed on the second run");
});

test("install reports locally modified files and leaves them alone", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const skillMd = path.join(targetOf(project), "SKILL.md");
  const edited = fs.readFileSync(skillMd, "utf8") + "\n<!-- my local edit -->\n";
  fs.writeFileSync(skillMd, edited);

  const r = runCli(["install", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /locally modified\/added\/removed file\(s\)/);
  assert.match(r.stdout, /SKILL\.md/);
  assert.strictEqual(fs.readFileSync(skillMd, "utf8"), edited, "local edit preserved");
});

test("--dry-run reports the plan and creates nothing", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const r = runCli(["install", "--project", project, "--dry-run"]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Dry run — no changes made\./);
  assert.strictEqual(fs.existsSync(targetOf(project)), false, "no skill directory created");
  assert.deepStrictEqual(treeHashes(project), treeHashes(project), "project unchanged");
});

test("default install leaves opencode.json byte-for-byte identical", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const cfg = path.join(project, "opencode.json");
  const before = fs.readFileSync(cfg);

  const r = runCli(["install", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);

  assert.ok(fs.readFileSync(cfg).equals(before), "opencode.json must not be rewritten");
  assert.match(r.stdout, /Configuration verified/);
});

test("installing when a skills entry already provides this skill asks first", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  // A *different* source root that already provides the same skill id.
  const vendorSkill = path.join(project, "vendor_skills", "engineering-cad");
  fs.mkdirSync(vendorSkill, { recursive: true });
  fs.copyFileSync(path.join(REPO_SKILL, "SKILL.md"), path.join(vendorSkill, "SKILL.md"));
  fs.copyFileSync(path.join(REPO_SKILL, "skill.json"), path.join(vendorSkill, "skill.json"));

  const cfgPath = path.join(project, "opencode.json");
  const cfg = readJson(cfgPath);
  cfg.skills = ["vendor_skills"];
  writeJson(cfgPath, cfg);

  const before = treeHashes(project);

  // Non-interactive, no --yes -> aborts without writing.
  const declined = runCli(["install", "--project", project]);
  assert.strictEqual(declined.status, 2, declined.output);
  assert.match(declined.output, /already provides this skill id/);
  assert.deepStrictEqual(treeHashes(project), before, "nothing written when confirmation is unavailable");

  // Explicit consent -> proceeds.
  const accepted = runCli(["install", "--project", project, "--yes"]);
  assert.strictEqual(accepted.status, 0, accepted.output);
  assert.ok(fs.existsSync(path.join(targetOf(project), "SKILL.md")));
});
