"use strict";

/* `autocad-skill version` — print skill / installer / tool-contract versions.
 *
 * Output is exactly:
 *   Engineering CAD Agent
 *   Skill version: X.Y.Z
 *   Installer version: A.B.C
 *   Tool Contract version: N
 * plus a fourth line when an installed copy differs from the available one.
 */

const path = require("path");
const fs = require("fs");
const ui = require("../ui");
const { resolveSkillSource, readPackageMeta } = require("../source");
const { findProjectRoot, resolveSkillsTarget, readInstalled, SKILL_ID } = require("../detect");
const { EXIT_OK, EXIT_ERROR } = require("../context");

/** Locate the installed skill, honoring --project / --global / cwd. */
function installedSkillJson(opts) {
  try {
    const cwd = path.resolve(opts.cwd || process.cwd());
    let startDir = cwd;
    if (opts.project) {
      startDir = path.resolve(cwd, opts.project);
      if (!fs.statSync(startDir).isDirectory()) return null;
    }
    const proj = findProjectRoot(startDir);
    const { targetDir } = resolveSkillsTarget(proj.root, { global: opts.global, skillId: SKILL_ID });
    const inst = readInstalled(targetDir);
    return inst.installed && inst.skillJson ? inst : null;
  } catch {
    return null;
  }
}

function run(opts = {}) {
  const pkg = readPackageMeta();

  // Prefer the available source; fall back to the installed copy.
  let skillJson = null;
  try {
    skillJson = resolveSkillSource().skillJson;
  } catch {
    const inst = installedSkillJson(opts);
    if (inst) skillJson = inst.skillJson;
  }

  if (!skillJson || !skillJson.version) {
    ui.fail("Skill version unavailable: no skill source and no installed skill found.");
    return EXIT_ERROR;
  }

  const lines = [
    "Engineering CAD Agent",
    `Skill version: ${skillJson.version}`,
    `Installer version: ${pkg.version}`,
    `Tool Contract version: ${skillJson.toolContractVersion}`,
  ];

  // Report an installed copy only when it differs from the available one.
  const inst = installedSkillJson(opts);
  if (inst && inst.version && inst.version !== skillJson.version) {
    lines.push(`Installed skill version: ${inst.version}`);
  }

  process.stdout.write(lines.join("\n") + "\n");
  return EXIT_OK;
}

module.exports = { run };
