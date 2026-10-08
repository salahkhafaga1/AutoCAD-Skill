"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, makeSkillSource, treeHashes, readJson, rmrf } = require("./helpers");

const TARGET = (p) => path.join(p, ".opencode", "skills", "engineering-cad");
const BACKUPS = (p) => path.join(p, ".autocad-skill-backups");

function newerSource() {
  return makeSkillSource({
    version: "0.2.0",
    mutate: (dir) => {
      fs.appendFileSync(path.join(dir, "rules", "planning_rules.md"), "\n<!-- updated by 0.2.0 -->\n");
      fs.writeFileSync(path.join(dir, "workflows", "extra_workflow.md"), "# Extra workflow\n");
      fs.rmSync(path.join(dir, "workflows", "plan_only.md"));
    },
  });
}

test("update: plan, dry-run, refuse without confirmation, apply with --yes, then roll back", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));
  const target = TARGET(project);

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const before = treeHashes(target);
  const env = { AUTOCAD_SKILL_SOURCE: newerSource() };

  // 1. Dry run shows the plan and writes nothing.
  const dry = runCli(["update", "--project", project, "--dry-run"], { env });
  assert.strictEqual(dry.status, 0, dry.output);
  assert.match(dry.stdout, /Current version:\s+0\.1\.0/);
  assert.match(dry.stdout, /Available version: 0\.2\.0\s+\(MINOR\)/);
  assert.match(dry.stdout, /Files that will be updated:/);
  assert.match(dry.stdout, /Files that will be added:/);
  assert.match(dry.stdout, /Files that will be removed/);
  assert.match(dry.stdout, /Dry run — no changes made\./);
  assert.deepStrictEqual(treeHashes(target), before, "dry run changed nothing");
  assert.strictEqual(fs.existsSync(BACKUPS(project)), false, "dry run created no backup");

  // 2. Non-interactive without --yes: abort, write nothing.
  const refused = runCli(["update", "--project", project], { env });
  assert.strictEqual(refused.status, 2, refused.output);
  assert.match(refused.output, /Confirmation required/);
  assert.match(refused.output, /This update changes Agent behavior\./);
  assert.deepStrictEqual(treeHashes(target), before, "refused update changed nothing");
  assert.strictEqual(fs.existsSync(BACKUPS(project)), false, "no backup created when refused");

  // 3. With --yes: applies the update, backs up, validates.
  const applied = runCli(["update", "--project", project, "--yes"], { env });
  assert.strictEqual(applied.status, 0, applied.output);
  assert.match(applied.stdout, /Update complete\./);
  assert.match(applied.stdout, /Backup created: /);

  assert.match(fs.readFileSync(path.join(target, "rules", "planning_rules.md"), "utf8"), /updated by 0\.2\.0/);
  assert.ok(fs.existsSync(path.join(target, "workflows", "extra_workflow.md")), "new file added");
  assert.ok(!fs.existsSync(path.join(target, "workflows", "plan_only.md")), "obsolete file removed");

  const manifest = readJson(path.join(target, ".autocad-skill-manifest.json"));
  assert.strictEqual(manifest.skillVersion, "0.2.0");
  assert.strictEqual(manifest.previousVersion, "0.1.0");

  const backups = fs.readdirSync(BACKUPS(project));
  assert.ok(backups.length >= 1, "a backup directory exists");
  assert.ok(fs.existsSync(path.join(BACKUPS(project), backups[0], "SKILL.md")), "backup holds the old skill");

  // 4. Rollback restores the previous version and drops files the update added.
  const rb = runCli(["update", "--project", project, "--rollback", "--yes"], { env });
  assert.strictEqual(rb.status, 0, rb.output);
  assert.match(rb.stdout, /Rollback complete\./);
  assert.ok(fs.existsSync(path.join(target, "workflows", "plan_only.md")), "removed file restored");
  assert.ok(!fs.existsSync(path.join(target, "workflows", "extra_workflow.md")), "update-added file dropped");
  assert.match(fs.readFileSync(path.join(target, "rules", "planning_rules.md"), "utf8"), /^# Planning/i);

  const restored = readJson(path.join(target, ".autocad-skill-manifest.json"));
  assert.strictEqual(restored.skillVersion, "0.1.0");
});

test("update detects local modifications and will not overwrite them without confirmation", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));
  const target = TARGET(project);

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const skillMd = path.join(target, "SKILL.md");
  const edited = fs.readFileSync(skillMd, "utf8") + "\n<!-- LOCAL EDIT -->\n";
  fs.writeFileSync(skillMd, edited);

  // Refused: file must remain exactly as the user left it.
  const refused = runCli(["update", "--project", project]);
  assert.strictEqual(refused.status, 2, refused.output);
  assert.match(refused.output, /STOP: 1 locally modified file\(s\)/);
  assert.match(refused.output, /SKILL\.md/);
  assert.strictEqual(fs.readFileSync(skillMd, "utf8"), edited, "local edit preserved when refused");

  // Confirmed: applied, and the edit survives in the backup.
  const applied = runCli(["update", "--project", project, "--yes"]);
  assert.strictEqual(applied.status, 0, applied.output);
  assert.ok(!fs.readFileSync(skillMd, "utf8").includes("LOCAL EDIT"), "edit replaced after confirmation");

  const backups = fs.readdirSync(BACKUPS(project)).sort().reverse();
  const saved = path.join(BACKUPS(project), backups[0], "SKILL.md");
  assert.ok(fs.readFileSync(saved, "utf8").includes("LOCAL EDIT"), "edit preserved in the backup");
});

test("update reports 'up to date' when installed files match the source", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const r = runCli(["update", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Up to date/);
});

test("a file the user added survives every update, not just the first", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));
  const target = TARGET(project);

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  fs.writeFileSync(path.join(target, "my-notes.md"), "mine\n");

  const src2 = newerSource();
  const src3 = makeSkillSource({
    version: "0.3.0",
    mutate: (dir) => fs.appendFileSync(path.join(dir, "rules", "planning_rules.md"), "\n<!-- 0.3.0 -->\n"),
  });
  t.after(() => { rmrf(path.dirname(src2)); rmrf(path.dirname(src3)); });

  const first = runCli(["update", "--project", project, "--yes"], { env: { AUTOCAD_SKILL_SOURCE: src2 } });
  assert.strictEqual(first.status, 0, first.output);
  assert.ok(fs.existsSync(path.join(target, "my-notes.md")), "kept after the first update");
  assert.match(first.stdout, /kept 1 local file\(s\)/);

  // The second update is where recording the whole directory used to bite:
  // the first update had written the user's file into the manifest, so the
  // second one treated it as stale installer output and removed it.
  const second = runCli(["update", "--project", project, "--yes"], { env: { AUTOCAD_SKILL_SOURCE: src3 } });
  assert.strictEqual(second.status, 0, second.output);
  assert.ok(fs.existsSync(path.join(target, "my-notes.md")), "kept after the second update");
  assert.match(second.stdout, /kept 1 local file\(s\)/);

  // It still reads as the user's, not as something the installer wrote.
  const d = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_SOURCE: src3 } });
  assert.strictEqual(d.status, 0, d.output);
  assert.match(d.stdout, /Local modifications .*1 added/);
});

test("update on a project with no installation exits 1", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const r = runCli(["update", "--project", project]);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /not installed/);
});

test("rollback with no backups exits 1", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const r = runCli(["update", "--project", project, "--rollback"]);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /No backups found/);
});
