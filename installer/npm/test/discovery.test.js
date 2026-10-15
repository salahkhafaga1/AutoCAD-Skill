"use strict";

/*
 * OpenCode V2 Skill discovery requirements.
 *
 * Source of truth: https://opencode.ai/v2/docs/skills/
 *
 *   Global sources:  ~/.config/opencode/skills, ~/.claude/skills, ~/.agents/skills
 *   Project sources: .opencode/skills, .claude/skills, .agents/skills
 *   ID:              the skill directory name (frontmatter `name` is the label)
 *   Advertised:      unless the frontmatter opts out of model invocation
 *
 * These tests pin the properties a user depends on for `/engineering-cad` to
 * exist: the right folder, the right id, and frontmatter that keeps the skill
 * advertised. They are structural checks only — no AutoCAD is involved.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const {
  runCli, makeProject, fakeHome, globalTargetOf, treeHashes, rmrf,
} = require("./helpers");

function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  assert.ok(m, "SKILL.md must start with YAML frontmatter");
  return m[1];
}

test("global install lands in a documented OpenCode discovery source", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);

  const target = globalTargetOf(home);
  assert.ok(fs.existsSync(path.join(target, "SKILL.md")));
  assert.strictEqual(
    path.basename(target), "engineering-cad",
    "directory name is the skill id"
  );
  assert.strictEqual(path.basename(path.dirname(target)), "skills");
  assert.strictEqual(path.basename(path.dirname(path.dirname(target))), "opencode");
  assert.strictEqual(path.basename(path.dirname(path.dirname(path.dirname(target)))), ".config");

  // Explicitly NOT the pre-fix location, which OpenCode never reads.
  assert.strictEqual(
    fs.existsSync(path.join(home, ".opencode", "skills", "engineering-cad")),
    false,
    "must not install into <home>/.opencode/skills"
  );

  assert.match(r.stdout, /Skill ID: engineering-cad \(mention @engineering-cad/);
});

test("--global and the default resolve to the same directory", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install"], { cwd: project, env }).status, 0);
  assert.ok(fs.existsSync(path.join(globalTargetOf(home), "SKILL.md")));
  assert.match(runCli(["install", "--global"], { cwd: project, env }).output, /Already installed/);
});

test("--local installs into the project instead of the global source", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install", "--local", "--project", project], {
    env: { AUTOCAD_SKILL_HOME: home },
  });
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(
    fs.existsSync(path.join(project, ".opencode", "skills", "engineering-cad", "SKILL.md")),
    "installed into <project>/.opencode/skills/engineering-cad"
  );
  assert.strictEqual(fs.existsSync(globalTargetOf(home)), false, "global source untouched");
  assert.match(r.stdout, /\(project\)/);
});

test("installed frontmatter meets OpenCode's requirements", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);

  const md = fs.readFileSync(path.join(globalTargetOf(home), "SKILL.md"), "utf8");
  const fm = frontmatter(md);

  // Display label agrees with the directory name (the path-derived skill id).
  assert.match(fm, /^name:\s*engineering-cad\s*$/m, "frontmatter name is the skill id");

  // `description` is what makes the skill advertised in the first place.
  assert.match(fm, /^description:/m, "description is required for advertisement");

  // No fictional OpenCode fields: skills never appear as / commands on their
  // own (commands/ files do that). Unknown keys are ignored silently, so a
  // stale `slash: true` would mislead authors without ever working.
  assert.doesNotMatch(fm, /^slash:\s*true\s*$/m, "no fictional slash field");

  // Nothing may opt the skill out of discovery.
  assert.doesNotMatch(fm, /autoinvoke:\s*false/i, "must not be hidden from the model");
  assert.doesNotMatch(fm, /disable-model-invocation:\s*true/i, "must not be hidden from the model");
});

test("skill.json id matches the installed directory name", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  assert.strictEqual(
    runCli(["install"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } }).status, 0
  );
  const sj = JSON.parse(fs.readFileSync(path.join(globalTargetOf(home), "skill.json"), "utf8"));
  assert.strictEqual(sj.id, "engineering-cad");
  assert.strictEqual(sj.version, "0.2.0");
  assert.strictEqual(sj.toolContractVersion, 2);
});

test("doctor confirms id, discovery source, and skill permission", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install"], { cwd: project, env }).status, 0);

  const r = runCli(["doctor"], { cwd: project, env });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /✓ Skill ID .*engineering-cad .*@engineering-cad/);
  assert.match(r.stdout, /✓ Skill discovery .*is a documented OpenCode source/);
  assert.match(r.stdout, /✓ skill permission/);
  assert.match(r.stdout, /Result: no errors\./);
});

test("doctor flags a deny rule that would hide the skill", (t) => {
  const project = makeProject({
    theme: "dark",
    skills: [],
    permissions: [
      { action: "shell", resource: "*", effect: "allow" },
      { action: "skill", resource: "engineering-cad", effect: "deny" },
    ],
  });
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install"], { cwd: project, env }).status, 0);

  const r = runCli(["doctor"], { cwd: project, env });
  assert.strictEqual(r.status, 1, "a deny rule is an error, not a warning");
  assert.match(r.stdout, /✖ skill permission .*denied/);
  assert.match(r.stdout, /Result: ERRORS found/);
});

test("doctor accepts an explicit allow rule for the skill", (t) => {
  const project = makeProject({
    theme: "dark",
    skills: [],
    permissions: [{ action: "skill", resource: "engineering-*", effect: "allow" }],
  });
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install"], { cwd: project, env }).status, 0);

  const r = runCli(["doctor"], { cwd: project, env });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /✓ skill permission .*allowed by rule/);
});

test("nothing outside the target is written by a global install", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  const before = treeHashes(home);
  const r = runCli(["install", "--dry-run", "--yes"], { cwd: project, env });
  assert.strictEqual(r.status, 0, r.output);
  assert.deepStrictEqual(treeHashes(home), before, "dry run writes nothing");

  assert.strictEqual(runCli(["install", "--yes"], { cwd: project, env }).status, 0);
  const roots = fs.readdirSync(home).sort();
  assert.deepStrictEqual(roots, [".config"], "only .config/opencode was created");
});
