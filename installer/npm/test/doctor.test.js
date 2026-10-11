"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runCli, makeProject, treeHashes, writeJson, fakeHome, rmrf } = require("./helpers");

test("doctor reports checks and a summary, exiting 0 with no errors", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const r = runCli(["doctor", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);

  assert.match(r.stdout, /Node\.js/);
  assert.match(r.stdout, /OpenCode/);
  assert.match(r.stdout, /Engineering CAD Skill/);
  assert.match(r.stdout, /OpenCode configuration/);
  assert.match(r.stdout, /autocad-mcp/);
  assert.match(r.stdout, /AutoCAD/);
  assert.match(r.stdout, /Summary: \d+ passed, \d+ warning\(s\), \d+ error\(s\), \d+ not detected/);
  assert.match(r.stdout, /Result: no errors\./);
});

test("doctor is read-only", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const before = treeHashes(project);
  runCli(["doctor", "--project", project]);
  assert.deepStrictEqual(treeHashes(project), before, "doctor must not write anything");
});

test("doctor flags an unparseable config as an error and exits 1", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  fs.writeFileSync(path.join(project, "opencode.json"), "{ not json ");

  const r = runCli(["doctor", "--project", project]);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /OpenCode configuration/);
  assert.match(r.output, /Result: ERRORS found/);
});

test("doctor reports MCP configured globally when the project has none", (t) => {
  const project = makeProject({ mcp: { servers: {} } });
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const exeDir = path.join(home, "venv", "Scripts");
  fs.mkdirSync(exeDir, { recursive: true });
  const exe = path.join(exeDir, "autocad-mcp.exe");
  fs.writeFileSync(exe, "x");
  writeJson(path.join(home, ".config", "opencode", "opencode.json"), {
    mcp: { servers: { "autocad-mcp": { command: [exe] } } },
  });

  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /autocad-mcp.*configured \(global/);
});

test("doctor warns when the MCP server is nowhere configured", (t) => {
  const project = makeProject({ mcp: { servers: {} } });
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /autocad-mcp.*not configured in this project or globally/);
});

test("doctor warns when the configured MCP command does not exist", (t) => {
  const project = makeProject({
    mcp: { servers: { "autocad-mcp": { command: ["C:/no/such/autocad-mcp.exe"] } } },
  });
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["doctor", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /autocad-mcp.*command not found/);
});

test("doctor sees an installed skill and reports integrity", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const r = runCli(["doctor", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Engineering CAD Skill v0\.2\.0/);
  assert.match(r.stdout, /Skill integrity .*structure and hashes verified/);
  assert.match(r.stdout, /Local modifications .*none/);
});

test("doctor reports local modifications as a warning, not an error", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  assert.strictEqual(runCli(["install", "--project", project]).status, 0);
  const skillMd = path.join(project, ".opencode", "skills", "engineering-cad", "SKILL.md");
  fs.appendFileSync(skillMd, "\n<!-- edited -->\n");

  const r = runCli(["doctor", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Local modifications .*1 modified/);
  assert.match(r.stdout, /Result: no errors\./);
});
