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

/** Clean environment: no debug flag, no inherited XDG config, and defaults
 *  that keep every test hermetic on any machine:
 *
 *    AUTOCAD_SKILL_HOME   a throwaway home, so no test can read or write the
 *                         real machine's ~/.config/opencode or ~/.opencode
 *    AUTOCAD_SKILL_SOURCE the repo source, so a test never picks up a stale
 *                         `installer/npm/skill/` build artifact left behind by
 *                         an earlier `npm pack`
 *
 * Pass an explicit value in `extra` to opt a test out of either default. */
function baseEnv(extra = {}) {
  const env = { ...process.env };
  delete env.AUTOCAD_SKILL_DEBUG;
  delete env.XDG_CONFIG_HOME;
  if (!Object.prototype.hasOwnProperty.call(extra, "AUTOCAD_SKILL_HOME")) {
    env.AUTOCAD_SKILL_HOME = tempDir("acs-home-");
  }
  if (!Object.prototype.hasOwnProperty.call(extra, "AUTOCAD_SKILL_SOURCE")) {
    env.AUTOCAD_SKILL_SOURCE = REPO_SKILL;
  }
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

/** Create a temp OpenCode project with a config file (unless config === null).
 *
 *  A configless project still gets a `.git` marker so that findProjectRoot()
 *  stops here. Without it the walk continues above the temp directory and can
 *  pick up an unrelated ancestor (a real `~/.opencode` on the machine running
 *  the tests), which would both make the test non-deterministic and let it
 *  touch real user files. */
function makeProject(config) {
  const dir = tempDir();
  if (config !== null) writeJson(path.join(dir, "opencode.json"), config === undefined ? defaultConfig() : config);
  else fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
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

/** A throwaway home directory, used as AUTOCAD_SKILL_HOME so no test can
 *  touch the real machine's ~/.config/opencode or ~/.opencode. */
function fakeHome() {
  return tempDir("acs-home-");
}

/** <home>/.config/opencode/skills/<id> — OpenCode's global skills source. */
function globalTargetOf(home, id = "engineering-cad") {
  return path.join(home, ".config", "opencode", "skills", id);
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

/**
 * The install manifest a 0.2.0 install recorded for `dir`.
 *
 * Call it *after* writing what the old installer shipped and *before* adding
 * anything of the user's own: only files that predate the manifest are the
 * installer's, and only those may be refreshed or removed later.
 */
function writeLegacyManifest(dir, { skillId = "engineering_agent", skillVersion = "0.1.0", installerVersion = "0.2.0" } = {}) {
  const files = treeHashes(dir);
  delete files[".autocad-skill-manifest.json"];
  writeJson(path.join(dir, ".autocad-skill-manifest.json"), {
    schema: 1,
    skillId,
    skillVersion,
    installerVersion,
    installedAt: new Date().toISOString(),
    files,
  });
  return dir;
}

/**
 * Rewrite a skill directory to the identity releases up to 0.2.0 shipped:
 * frontmatter `name: engineering-cad-agent` and `skill.json.id` =
 * `engineering_agent`. Used to build a legacy install that the current
 * source genuinely differs from.
 */
function downgradeToOldIdentity(dir) {
  const md = path.join(dir, "SKILL.md");
  const text = fs.readFileSync(md, "utf8").replace(/^name:\s*engineering-cad\s*$/m, "name: engineering-cad-agent");
  fs.writeFileSync(md, text, "utf8");
  const sj = readJson(path.join(dir, "skill.json"));
  sj.id = "engineering_agent";
  sj.name = "engineering-cad-agent";
  writeJson(path.join(dir, "skill.json"), sj);
  return dir;
}

module.exports = {
  BIN, PKG, REPO_SKILL,
  runCli, tempDir, makeProject, makeSkillSource, fakeHome, globalTargetOf,
  writeJson, readJson, defaultConfig,
  treeHashes, shaFile, rmrf, baseEnv,
  writeLegacyManifest, downgradeToOldIdentity,
};
