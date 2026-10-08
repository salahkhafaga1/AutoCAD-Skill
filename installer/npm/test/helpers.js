"use strict";

/* Shared helpers for the installer test suite (node:test, no dependencies).
 *
 * Every test runs against a throwaway directory in the OS temp dir. No test
 * ever writes into the repository or into the real machine project. */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const BIN = path.resolve(__dirname, "..", "bin", "autocad-skill.js");
const PKG = path.resolve(__dirname, "..");
const REPO_SKILL = path.resolve(PKG, "..", "..", "skill", "engineering_agent");

/** Clean environment: no inherited skill-source override, no debug flag. */
function baseEnv(extra = {}) {
  const env = { ...process.env };
  delete env.AUTOCAD_SKILL_SOURCE;
  delete env.AUTOCAD_SKILL_DEBUG;
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

/** Run the CLI in a child process. stdin is closed so a prompt never hangs. */
function runCli(args, { cwd, env, input } = {}) {
  const res = spawnSync(process.execPath, [BIN, ...args], {
    cwd: cwd || PKG,
    env: baseEnv(env),
    encoding: "utf8",
    input: input === undefined ? "" : input,
    timeout: 120000,
  });
  if (res.error) throw res.error;
  return {
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    output: (res.stdout || "") + (res.stderr || ""),
  };
}

function tempDir(prefix = "acs-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function defaultConfig() {
  return {
    theme: "dark",
    mcp: {
      servers: {
        "autocad-mcp": { command: "C:/tools/autocad-mcp.exe", cwd: "D:/somewhere/autocad-mcp" },
      },
    },
    skills: ["vendor_skills/other_skill"],
  };
}

/** Create a temp OpenCode project with a config file (unless config === null). */
function makeProject(config) {
  const dir = tempDir();
  if (config !== null) writeJson(path.join(dir, "opencode.json"), config === undefined ? defaultConfig() : config);
  return dir;
}

function shaFile(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** { "rel/path": sha256 } for every file under dir (empty object if missing). */
function treeHashes(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) out[r] = shaFile(path.join(d, e.name));
    }
  };
  walk(dir, "");
  return out;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/**
 * Build a standalone skill source for update tests.
 * Returns the directory that AUTOCAD_SKILL_SOURCE should point at.
 */
function makeSkillSource({ version, mutate } = {}) {
  const root = tempDir("acs-src-");
  const dir = path.join(root, "engineering_agent");
  fs.cpSync(REPO_SKILL, dir, { recursive: true });
  if (mutate) mutate(dir);
  if (version) {
    const sj = readJson(path.join(dir, "skill.json"));
    sj.version = version;
    writeJson(path.join(dir, "skill.json"), sj);
  }
  return dir;
}

module.exports = {
  BIN, PKG, REPO_SKILL,
  runCli, tempDir, makeProject, makeSkillSource,
  writeJson, readJson, defaultConfig,
  treeHashes, shaFile, rmrf, baseEnv,
};
