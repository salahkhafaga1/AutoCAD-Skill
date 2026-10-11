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

/* The OpenCode skill id == the installed directory name == SKILL.md
 * frontmatter `name`. All three are kept equal so the id is the same under
 * either resolution order OpenCode may use. */
const SKILL_ID = "engineering-cad";

/* Directory names used by pre-0.2.1 installs. Kept only so we can find and
 * migrate them; never used as an install target. */
const LEGACY_SKILL_IDS = ["engineering_agent"];

/* ------------------------------------------------------------------ OS ---- */

/**
 * Home directory, overridable for tests/CI.
 *
 * AUTOCAD_SKILL_HOME replaces the home directory for every global path this
 * package derives (skill source, backups, legacy locations). It exists so the
 * test suite never touches a real machine home directory.
 */
function homeDir() {
  const override = process.env.AUTOCAD_SKILL_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return os.homedir();
}

/**
 * OpenCode's global skills source root.
 *
 * Honors XDG_CONFIG_HOME (the documented override for ~/.config/opencode) and
 * otherwise uses <home>/.config/opencode/skills.
 */
function globalSkillsRoot() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? path.resolve(xdg.trim()) : path.join(homeDir(), ".config");
  return path.join(base, "opencode", "skills");
}

/** Global OpenCode configuration directory (same resolution as above). */
function globalConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? path.resolve(xdg.trim()) : path.join(homeDir(), ".config");
  return path.join(base, "opencode");
}

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
  const globalConfig = isFile(path.join(globalConfigDir(), "opencode.json")) ||
                       isDir(globalConfigDir());
  const projectOpenDir = isDir(path.join(root, ".opencode"));
  const skillRoot = globalSkillsRoot();
  const globalSkills = isDir(skillRoot) || isDir(path.dirname(skillRoot));
  return {
    binary,
    config: configPath,
    globalConfig,
    projectOpenDir,
    detected: Boolean(binary || configPath || globalConfig || projectOpenDir || globalSkills),
    signals: [
      binary && "binary",
      configPath && "project config",
      projectOpenDir && ".opencode/",
      globalConfig && "global config",
      globalSkills && "global skills",
    ].filter(Boolean),
  };
}

/**
 * Every skills source root OpenCode V2 documents for this machine, in
 * precedence order (low to high). Used by doctor to prove the install target
 * really is discovered.
 */
function documentedSkillRoots(projectRoot) {
  return {
    global: [
      path.join(globalSkillsRoot()),
      path.join(homeDir(), ".claude", "skills"),
      path.join(homeDir(), ".agents", "skills"),
    ],
    project: [
      path.join(projectRoot, ".opencode", "skills"),
      path.join(projectRoot, ".claude", "skills"),
      path.join(projectRoot, ".agents", "skills"),
    ],
  };
}

/** True when `dir` sits directly inside one of the documented source roots. */
function isDocumentedTarget(dir, projectRoot) {
  const roots = documentedSkillRoots(projectRoot);
  const parent = path.dirname(path.resolve(dir));
  return [...roots.global, ...roots.project].some(
    (r) => path.resolve(r) === parent
  );
}

/* ----------------------------------------------------- skills locations --- */

/** Official OpenCode skill locations (project + global).
 *
 * OpenCode V2 discovers exactly these sources:
 *   Global   ~/.config/opencode/skills, ~/.claude/skills, ~/.agents/skills
 *   Project  .opencode/skills, .claude/skills, .agents/skills
 *
 * `~/.opencode/skills` is NOT a source in either scope, which is why the
 * default install target is the global source and not a home-relative
 * `.opencode` directory.
 *
 * Default scope is GLOBAL: `npx autocad-skill` must work from any directory,
 * including one that is not an OpenCode project. `--local` / `--project <dir>`
 * select the project scope instead. */
function resolveSkillsTarget(root, { global: globalTarget = true, skillId = SKILL_ID } = {}) {
  if (globalTarget) {
    const skillsRoot = globalSkillsRoot();
    return { skillsRoot, targetDir: path.join(skillsRoot, skillId), mode: "global" };
  }
  const skillsRoot = path.join(root, ".opencode", "skills");
  return { skillsRoot, targetDir: path.join(skillsRoot, skillId), mode: "project" };
}

/** Backups live OUTSIDE every skills source root, so a backed-up SKILL.md can
 * never be discovered as a duplicate skill. */
function backupRootFor(projectRoot, { global: globalTarget = false } = {}) {
  if (globalTarget) return path.join(homeDir(), ".autocad-skill-backups");
  return path.join(projectRoot, ".autocad-skill-backups");
}

/**
 * Locations that older installs may have used, for the active scope.
 *
 * Only directories that actually contain a SKILL.md are returned, and only the
 * legacy skill directory itself is ever reported — never its parent, and never
 * a sibling skill. Migration may delete the reported directory after
 * confirmation; nothing else in those parents is touched.
 *
 * Global scope migrates home-level leftovers (the broken default produced
 * `<home>/.opencode/skills/<id>`). Project scope migrates that project's own
 * previous install.
 */
function legacyInstallDirs(projectRoot, { global: globalTarget = true } = {}) {
  const roots = globalTarget
    ? [
        // Observed broken default: a home-relative .opencode OpenCode never reads.
        path.join(homeDir(), ".opencode", "skills"),
        // Correct root, previous directory name.
        globalSkillsRoot(),
      ]
    : [path.join(projectRoot, ".opencode", "skills")];

  const out = [];
  for (const root of roots) {
    for (const id of LEGACY_SKILL_IDS) {
      const dir = path.join(root, id);
      if (dir === root) continue;
      if (isFile(path.join(dir, "SKILL.md"))) out.push(dir);
    }
  }
  // De-duplicate while preserving order.
  return [...new Set(out)];
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

/* --------------------------------------- reference toolchain -------- */

/**
 * Locate the reference-tool scripts (P0.2/P0.3/Track C tools).
 *
 * Installed layout keeps them at <package>/tools; a repository checkout
 * keeps them at <repo>/tools. Both are probed read-only; the first
 * directory that exists wins. Individual scripts are reported so a
 * partial copy is visible instead of silently half-working.
 */
const REF_TOOL_SCRIPTS = ["ref_inspect.py", "ref_extract.py", "ref_search.py", "ref_ocr.py"];

function detectRefTools() {
  const candidates = [
    path.join(__dirname, "..", "tools"),
    path.join(__dirname, "..", "..", "tools"),
  ];
  const toolsDir = candidates.find((d) => isDir(d)) || null;
  const scripts = REF_TOOL_SCRIPTS.map((name) => ({
    name,
    present: toolsDir ? isFile(path.join(toolsDir, name)) : false,
  }));
  return { toolsDir, scripts };
}

/** pypdf import probe for Tier-1 extraction (read-only, short timeout). */
function detectPypdf() {
  const py = detectPython();
  if (!py.detected) return { present: false, version: null };
  let res;
  try {
    res = spawnSync(py.cmd, ["-c", "import pypdf; print(pypdf.__version__)"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 30000,
    });
  } catch {
    return { present: false, version: null };
  }
  const version = res && res.status === 0
    ? (res.stdout || "").trim().split(/\r?\n/)[0] || "present"
    : null;
  return { present: version !== null, version };
}

/** Tesseract presence probe (version print only — never processes files). */
function detectTesseract() {
  const v = runVersion("tesseract");
  return { present: Boolean(v), version: v };
}

/**
 * Which agent hosts show signs of life (read-only).
 * Signals per host: OpenCode reuses detectOpenCode; Claude Code and Codex
 * are detected by their well-known directories (home + project scope).
 * Used only to order interactive choices and defaults — never to decide
 * anything silently.
 */
function detectHosts(projectRoot) {
  const oc = { agent: "opencode", detected: false, signals: [] };
  try {
    const openCode = detectOpenCode(projectRoot, findConfigFile(projectRoot));
    oc.detected = openCode.detected;
    oc.signals = openCode.signals;
  } catch {
    /* detection failure means "not detected", never an error */
  }
  const claudeSignals = [];
  if (isDir(path.join(homeDir(), ".claude"))) claudeSignals.push("~/.claude/");
  if (isDir(path.join(path.resolve(projectRoot), ".claude"))) claudeSignals.push(".claude/");
  const codexSignals = [];
  if (isDir(path.join(homeDir(), ".codex"))) codexSignals.push("~/.codex");
  if (isDir(path.join(homeDir(), ".agents"))) codexSignals.push("~/.agents/");
  if (isDir(path.join(path.resolve(projectRoot), ".agents"))) codexSignals.push(".agents/");
  return [
    oc,
    { agent: "claude", detected: claudeSignals.length > 0, signals: claudeSignals },
    { agent: "codex", detected: codexSignals.length > 0, signals: codexSignals },
  ];
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
  LEGACY_SKILL_IDS,
  detectOS, findProjectRoot, findConfigFile, detectOpenCode,
  homeDir, globalSkillsRoot, globalConfigDir,
  resolveSkillsTarget, backupRootFor, legacyInstallDirs,
  documentedSkillRoots, isDocumentedTarget, readInstalled,
  detectNpm, detectPython, detectAutoCAD, readMcpConfig, detectHosts,
  detectRefTools, detectPypdf, detectTesseract, REF_TOOL_SCRIPTS,
};
