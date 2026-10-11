"use strict";

/* Multi-agent install tests (node:test, no dependencies).
 *
 * The skill directory follows the Agent Skills open standard, so every
 * host loads the same files — only the install roots differ. These tests
 * pin each agent's global and project targets, the doctor verdicts, the
 * update roundtrip, and the invalid-agent error. Temp homes and projects
 * only. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, tempDir, fakeHome, readJson, rmrf } = require("./helpers");

const ROOTS = {
  opencode: [".config/opencode/skills", ".opencode/skills"],
  claude: [".claude/skills", ".claude/skills"],
  codex: [".agents/skills", ".agents/skills"],
};

function target(home, project, agent, scope) {
  const base = scope === "global"
    ? path.join(home, ...ROOTS[agent][0].split("/"))
    : path.join(project, ...ROOTS[agent][1].split("/"));
  return path.join(base, "engineering-cad");
}

for (const agent of ["claude", "codex"]) {
  test(`install --agent ${agent} lands in that agent's global skills root`, (t) => {
    const home = fakeHome();
    const cwd = tempDir("acs-cwd-");
    t.after(() => { rmrf(home); rmrf(cwd); });

    const r = runCli(["install", "--agent", agent], { cwd, env: { AUTOCAD_SKILL_HOME: home } });
    assert.strictEqual(r.status, 0, r.output);
    const dir = target(home, null, agent, "global");
    assert.ok(fs.existsSync(path.join(dir, "SKILL.md")));
    assert.strictEqual(readJson(path.join(dir, "skill.json")).id, "engineering-cad");
  });

  test(`install --agent ${agent} into a project`, (t) => {
    const project = makeProject();
    const home = fakeHome();
    t.after(() => { rmrf(project); rmrf(home); });

    const r = runCli(["install", "--agent", agent, "--local", "--project", project],
      { env: { AUTOCAD_SKILL_HOME: home } });
    assert.strictEqual(r.status, 0, r.output);
    const dir = target(home, project, agent, "project");
    assert.ok(fs.existsSync(path.join(dir, "SKILL.md")));
  });
}

test("doctor --agent reports discovery for that host, exit 0", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });
  const env = { AUTOCAD_SKILL_HOME: home };

  assert.strictEqual(runCli(["install", "--agent", "claude", "--local", "--project", project], { env }).status, 0);
  const r = runCli(["doctor", "--agent", "claude", "--local", "--project", project], { env });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Claude Code/);
  assert.match(r.stdout, /is inside Claude Code's skills root/);
  assert.ok(!/OpenCode configuration/.test(r.stdout), "no opencode config noise for other agents");
});

test("update roundtrip works with --agent", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });
  const env = { AUTOCAD_SKILL_HOME: home };

  assert.strictEqual(runCli(["install", "--agent", "codex", "--local", "--project", project], { env }).status, 0);
  const r = runCli(["update", "--agent", "codex", "--local", "--project", project], { env });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /up to date|Up to date|Update complete/);
});

test("unknown --agent fails with the valid names", (t) => {
  const home = fakeHome();
  const cwd = tempDir("acs-cwd-");
  t.after(() => { rmrf(home); rmrf(cwd); });

  const r = runCli(["install", "--agent", "cursor"], { cwd, env: { AUTOCAD_SKILL_HOME: home } });
  assert.notStrictEqual(r.status, 0, r.output);
  assert.match(r.output, /opencode, claude, codex/);
});

test("default behavior is unchanged (OpenCode)", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /mention @engineering-cad/);
});
