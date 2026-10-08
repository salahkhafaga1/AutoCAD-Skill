"use strict";

/* Environment detection: OS, OpenCode project root, skill locations,
 * installed state, and external availability probes.
 *
 * Every function here is READ-ONLY. Nothing in this module writes files.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { exists, isDir, isFile, readJson } = require("./fsx");
const { MANIFEST_NAME } = require("./manifest");

/* Directory name == skill.json "id" == OpenCode skill id. */
const SKILL_ID = "engineering_agent";

/* ------------------------------------------------------------------ OS ---- */

function detectOS() {
  const names = { win32: "Windows", darwin: "macOS", linux: "Linux" };
  return { platform: process.platform, name: names[process.platform] || process.platform,
           isWindows: process.platform === "win32" };
}

/* -------------------------------------------------------- project root ---- */

const CONFIG_NAMES = ["opencode.json", "opencode.jsonc"];

/** Walk up from `startDir` the same way OpenCode does: the first directory
 * containing a config file or a git worktree becomes the project root.
 * Falls back to the first `.opencode` ancestor, then to `startDir`. */
function findProjectRoot(startDir) {
  const start = path.resolve(startDir);
  let dir = start;
  let firstOpenDir = null;
  for (;;) {
    let configPath = null;
    for (const name of CONFIG_NAMES) {
      const p = path.join(dir, name);
      if (isFile(p)) { configPath = p; break; }
    }
    if (configPath) return { root: dir, signals: { config: configPath, git: false, openDir: Boolean(firstOpenDir) } };
    if (isDir(path.join(dir, ".git"))) {
      return { root: dir, signals: { config: null, git: true, openDir: Boolean(firstOpenDir) } };
    }
    if (!firstOpenDir && isDir(path.join(dir, ".opencode"))) firstOpenDir = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (firstOpenDir) return { root: firstOpenDir, signals: { config: null, git: false, openDir: true } };
  return { root: start, signals: { config: null, git: false, openDir: false } };
}

function findConfigFile(root) {
  for (const name of CONFIG_NAMES) {
    const p = path.join(root, name);
    if (isFile(p)) return p;
  }
  return null;
}

/* ------------------------------------------------------- OpenCode probe --- */

function runVersion(cmd) {
  // Fixed command list only — no user input reaches these invocations.
  // On Windows the shell is needed for .cmd shims; pass a single string so
  // Node does not warn about shell + args.
  const opts = {
    shell: process.platform === "win32",
    windowsHide: true,
    encoding: "utf8",
    timeout: 10000,
  };
  const res = process.platform === "win32"
    ? spawnSync(`"${cmd}" --version`, opts)
    : spawnSync(cmd, ["--version"], opts);
  if (res.status === 0) {
    const first = (res.stdout || "").trim().split(/\r?\n/)[0] || "";
    return first || "available";
  }
  return null;
}

function detectOpenCode(root, configPath) {
  const binary = runVersion("opencode");
  const globalConfig = isFile(path.join(os.homedir(), ".config", "opencode", "opencode.json")) ||
                       isDir(path.join(os.homedir(), ".config", "opencode"));
  const projectOpenDir = isDir(path.join(root, ".opencode"));
  return {
    binary,
    config: configPath,
    globalConfig,
    projectOpenDir,
    detected: Boolean(binary || configPath || globalConfig || projectOpenDir),
    signals: [
      binary && "binary",
      configPath && "project config",
      projectOpenDir && ".opencode/",
      globalConfig && "global config",
    ].filter(Boolean),
  };
}

/* ----------------------------------------------------- skills locations --- */

/** Official OpenCode skill locations (project + global). */
function resolveSkillsTarget(root, { global: globalTarget = false, skillId = SKILL_ID } = {}) {
  if (globalTarget) {
    const skillsRoot = path.join(os.homedir(), ".config", "opencode", "skills");
    return { skillsRoot, targetDir: path.join(skillsRoot, skillId), mode: "global" };
  }
  const skillsRoot = path.join(root, ".opencode", "skills");
  return { skillsRoot, targetDir: path.join(skillsRoot, skillId), mode: "project" };
}

/** Backups live OUTSIDE every skills source root, so a backed-up SKILL.md can
 * never be discovered as a duplicate skill. */
function backupRootFor(projectRoot, { global: globalTarget = false } = {}) {
  if (globalTarget) return path.join(os.homedir(), ".autocad-skill-backups");
  return path.join(projectRoot, ".autocad-skill-backups");
}

/** Read the installed state of a skill directory. */
function readInstalled(targetDir) {
  const skillMd = path.join(targetDir, "SKILL.md");
  if (!isFile(skillMd)) return { installed: false, dir: targetDir };
  const skillJsonPath = path.join(targetDir, "skill.json");
  let skillJson = null;
  let skillJsonError = null;
  try { skillJson = readJson(skillJsonPath); } catch (e) { skillJsonError = String(e.message || e); }
  let manifest = null;
  try { manifest = readJson(path.join(targetDir, MANIFEST_NAME)); } catch { /* absent or unreadable */ }
  return {
    installed: true,
    dir: targetDir,
    skillJson,
    skillJsonError,
    manifest,
    hasManifest: Boolean(manifest),
    version: skillJson && skillJson.version ? skillJson.version : null,
  };
}

/* ------------------------------------------------- external probes -------- */

function detectNpm() {
  const v = runVersion("npm");
  return { version: v, detected: Boolean(v) };
}

function detectPython() {
  for (const cmd of ["python", "py", "python3"]) {
    const v = runVersion(cmd);
    if (v) return { version: v.replace(/^Python\s+/i, ""), detected: true, cmd };
  }
  return { version: null, detected: false, cmd: null };
}

function detectAutoCAD() {
  if (process.platform !== "win32") return { detected: false, path: null };
  const candidates = [];
  const pf = process.env.ProgramFiles;
  const pf86 = process.env["ProgramFiles(x86)"];
  for (const base of [pf, pf86]) {
    if (!base) continue;
    const autodesk = path.join(base, "Autodesk");
    try {
      for (const entry of fs.readdirSync(autodesk)) {
        if (/^AutoCAD/i.test(entry)) candidates.push(path.join(autodesk, entry));
      }
    } catch { /* no Autodesk directory */ }
  }
  return { detected: candidates.length > 0, path: candidates[0] || null };
}

/** Read the autocad-mcp entry from an OpenCode config (read-only). */
function readMcpConfig(configPath) {
  if (!configPath) return { configured: false, command: null, commandExists: false };
  let data;
  try { data = readJson(configPath); } catch { return { configured: false, command: null, commandExists: false, parseError: true }; }
  const entry = data && data.mcp && data.mcp.servers && data.mcp.servers["autocad-mcp"];
  if (!entry) return { configured: false, command: null, commandExists: false };
  const cmd = Array.isArray(entry.command) ? entry.command[0] : entry.command || null;
  return { configured: true, command: cmd, commandExists: cmd ? exists(cmd) : false, cwd: entry.cwd || null };
}

module.exports = {
  SKILL_ID,
  detectOS, findProjectRoot, findConfigFile, detectOpenCode,
  resolveSkillsTarget, backupRootFor, readInstalled,
  detectNpm, detectPython, detectAutoCAD, readMcpConfig,
};
