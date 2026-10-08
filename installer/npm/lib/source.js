"use strict";

/* Locate the skill source shipped with (or referenced by) this package.
 *
 * Resolution order:
 *   1. AUTOCAD_SKILL_SOURCE env override (development / test hook)
 *   2. <package>/skill/engineering_agent      (created by the prepack step)
 *   3. <package>/../../skill/engineering_agent (repository checkout, dev mode)
 *
 * Returns { dir, skillJson, origin } or throws with a human-readable reason.
 */

const fs = require("fs");
const path = require("path");

const PKG_ROOT = path.resolve(__dirname, "..");

function readJsonIfExists(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function isSkillDir(p) {
  return fs.existsSync(path.join(p, "SKILL.md")) &&
         fs.existsSync(path.join(p, "skill.json"));
}

/** Candidate skill source directories, in resolution order. */
function candidates() {
  const list = [];
  const override = process.env.AUTOCAD_SKILL_SOURCE;
  if (override) list.push({ origin: "env", dir: path.resolve(override) });
  list.push({ origin: "package", dir: path.join(PKG_ROOT, "skill", "engineering_agent") });
  list.push({ origin: "repository", dir: path.resolve(PKG_ROOT, "..", "..", "skill", "engineering_agent") });
  return list;
}

function resolveSkillSource() {
  for (const c of candidates()) {
    if (isSkillDir(c.dir)) {
      const skillJson = readJsonIfExists(path.join(c.dir, "skill.json"));
      if (!skillJson || !skillJson.version) {
        throw new Error(`skill source at ${c.dir} has an unreadable skill.json`);
      }
      return { dir: c.dir, skillJson, origin: c.origin };
    }
  }
  throw new Error(
    "skill source not found (checked AUTOCAD_SKILL_SOURCE, the packaged copy, " +
    "and the repository checkout). Reinstall the package or run from the repository."
  );
}

function readPackageMeta() {
  const pkg = readJsonIfExists(path.join(PKG_ROOT, "package.json"));
  if (!pkg) throw new Error(`package.json not found at ${PKG_ROOT}`);
  return { name: pkg.name, version: pkg.version };
}

module.exports = { resolveSkillSource, readPackageMeta, candidates, PKG_ROOT };
