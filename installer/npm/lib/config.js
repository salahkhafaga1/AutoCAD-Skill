"use strict";

/*
 * Safe, minimal opencode.json mutation.
 *
 * Rules (see docs/configuration.md):
 *   - Never touch keys we do not own. (autocad-mcp block, theme, agent, ...)
 *   - Only append our own skill path to a `skills` array, if present.
 *   - If the config has no `skills` array, we do NOT invent one: the default
 *     install location (.opencode/skills/) is auto-discovered, so no write is
 *     required. A `--register` / explicit skills-array mode may opt in later.
 *   - A missing config file is not an error (auto-discovery still works).
 */

const fs = require("fs");
const path = require("path");
const { isFile, readJson } = require("./fsx");

function normalize(p) {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Read the config, tolerating a missing file. */
function readConfig(configPath) {
  if (!configPath || !isFile(configPath)) return { exists: false, data: null, text: null };
  const text = fs.readFileSync(configPath, "utf8");
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const err = new Error(`Config is not valid JSON (${configPath}): ${e.message}`);
    err.code = "ECONFIGPARSE";
    throw err;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    const err = new Error(`Config root must be a JSON object (${configPath}).`);
    err.code = "ECONFIGPARSE";
    throw err;
  }
  return { exists: true, data, text };
}

/**
 * Report (read-only) the current registration state for our skill id.
 * Returns { skillsArrayPresent, paths, registered, conflict }.
 */
function inspectRegistration(configPath, targetDir, { skillId = "engineering-cad" } = {}) {
  const { exists, data } = readConfig(configPath);
  if (!exists) {
    return { exists: false, skillsArrayPresent: false, paths: [], registered: false, conflict: null };
  }
  const skills = Array.isArray(data.skills) ? data.skills : null;
  const paths = skills ? skills.filter((s) => typeof s === "string") : [];
  const cfgDir = path.dirname(configPath);
  const normTarget = normalize(targetDir);
  // An entry naming the skills root that contains our target is also "ours".
  const normSkillsRoot = normalize(path.dirname(targetDir));

  let registered = false;
  let conflict = null;
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? normalize(p) : normalize(path.join(cfgDir, p));
    if (abs === normTarget || abs === normSkillsRoot) { registered = true; continue; }
    // Another registered root that would also yield this skill id => duplicate.
    if (discoversSkillId(abs, skillId)) conflict = conflict || p;
  }
  return {
    exists: true,
    skillsArrayPresent: Array.isArray(data.skills),
    paths,
    registered,
    conflict,
    usesRelative: paths.some((p) => !path.isAbsolute(p)),
  };
}

/** Does registered root `root` resolve to the skill id, via either form:
 *  root itself is <...>/<skillId> with a SKILL.md, or root/<skillId>/SKILL.md exists? */
function discoversSkillId(root, skillId) {
  const r = normalize(root);
  if (r.endsWith(`/${skillId}`)) return isFileLike(path.join(root, "SKILL.md"));
  return isFileLike(path.join(root, skillId, "SKILL.md"));
}

function isFileLike(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/**
 * Append our target dir to a `skills` array, preserving every other key.
 * Returns { changed, before, after } or throws when a write would be unsafe.
 *
 * Refuses when:
 *   - config has a `skills` key that is not an array
 *   - the entry already exists (idempotent no-op, reported as changed:false)
 */
function registerSkillPath(configPath, targetDir, { dryRun = false } = {}) {
  const { exists, data } = readConfig(configPath);
  if (!exists) {
    const err = new Error(`No OpenCode config found at ${configPath} (nothing to register).`);
    err.code = "ENOCONFIG";
    throw err;
  }
  if (Object.prototype.hasOwnProperty.call(data, "skills") && !Array.isArray(data.skills)) {
    const err = new Error(`Refusing to modify "skills" in ${configPath}: it is not an array.`);
    err.code = "ECONFIGSHAPE";
    throw err;
  }

  const before = JSON.stringify(data);
  const skills = Array.isArray(data.skills) ? data.skills.slice() : [];
  const entry = normalize(targetDir);
  const already = skills.some((s) => {
    if (typeof s !== "string") return false;
    const abs = path.isAbsolute(s) ? normalize(s) : normalize(path.join(path.dirname(configPath), s));
    return abs === entry;
  });
  if (already) return { changed: false, before, after: before, entry };

  skills.push(entry);
  const next = { ...data, skills };

  if (!dryRun) {
    const backup = `${configPath}.autocad-skill-backup`;
    if (!isFile(backup)) fs.copyFileSync(configPath, backup);
    const tmp = `${configPath}.autocad-skill-tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, configPath);
  }
  return { changed: true, before, after: JSON.stringify(next), entry, backupPath: `${configPath}.autocad-skill-backup` };
}

/** True when the config file contains a non-empty skills array. */
function hasSkillsArray(configPath) {
  try {
    const { exists, data } = readConfig(configPath);
    return exists && Array.isArray(data.skills) && data.skills.length > 0;
  } catch {
    return false;
  }
}

/** Locate the autocad-mcp MCP block, read-only (never modified by the installer). */
function inspectMcp(configPath) {
  try {
    const { exists, data } = readConfig(configPath);
    if (!exists) return { present: false };
    const servers = data.mcp && data.mcp.servers;
    const entry = servers && servers["autocad-mcp"];
    if (!entry) return { present: false, hasMcpKey: Boolean(data.mcp) };
    return { present: true, entry, command: Array.isArray(entry.command) ? entry.command[0] : entry.command };
  } catch (e) {
    return { present: false, parseError: e.message };
  }
}

/* Whole-value wildcard match, the same `*` / `?` semantics OpenCode uses. */
function globMatch(pattern, value) {
  const rx = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[\\s\\S]*")
    .replace(/\?/g, "[\\s\\S]");
  return new RegExp(`^${rx}$`).test(String(value));
}

/**
 * Read-only check of the `skill` permission rules for our skill id.
 *
 * OpenCode's base policy is `{ action: "*", resource: "*", effect: "allow" }`,
 * so a skill is advertised and loadable with no configuration at all. We only
 * need to flag a rule that would hide or gate it.
 *
 * Returns { present, effect, resource, source } where `effect` is the winning
 * rule's effect, or "allow" when no `skill` rule matches.
 */
function inspectSkillPermission(configPaths, skillId) {
  const found = { present: false, effect: "allow", resource: null, source: null };
  for (const cfg of configPaths) {
    if (!cfg) continue;
    let data;
    try {
      const r = readConfig(cfg);
      if (!r.exists) continue;
      data = r.data;
    } catch (e) {
      return { ...found, parseError: e.message, source: cfg };
    }
    const rules = Array.isArray(data.permissions) ? data.permissions : [];
    // Rules are evaluated in order, last match wins — so walk forward.
    for (const rule of rules) {
      if (!rule || typeof rule !== "object") continue;
      if (rule.action !== "skill" && rule.action !== "*") continue;
      const resource = typeof rule.resource === "string" ? rule.resource : "*";
      if (!globMatch(resource, skillId)) continue;
      found.present = true;
      found.effect = rule.effect === "deny" || rule.effect === "ask" ? rule.effect : "allow";
      found.resource = resource;
      found.source = cfg;
    }
  }
  return found;
}

module.exports = {
  readConfig,
  inspectRegistration,
  registerSkillPath,
  hasSkillsArray,
  inspectMcp,
  inspectSkillPermission,
  globMatch,
  normalize,
};
