"use strict";

/* `autocad-skill install` — copy the skill into the OpenCode project. */

const path = require("path");
const ui = require("../ui");
const { buildContext, EXIT_OK, EXIT_ERROR, EXIT_ABORT } = require("../context");
const { walkFiles, copyFiles } = require("../fsx");
const { writeManifest, diffAgainstManifest } = require("../manifest");
const { validateSkillDir } = require("../validate");
const { needConfirm } = require("../prompt");
const { registerSkillPath } = require("../config");

async function run(opts = {}) {
  ui.header("Engineering CAD Agent Skill");
  const ctx = buildContext(opts);

  // An unreadable opencode.json stops us: we refuse to act on a project whose
  // configuration we cannot read and therefore cannot preserve or verify.
  if (ctx.configError) {
    ui.fail(`OpenCode configuration cannot be read: ${ctx.configError.message}`);
    return EXIT_ERROR;
  }

  // 1. OS
  ui.ok(`OS detected: ${ctx.osInfo.name}`);

  // 2. OpenCode
  if (ctx.openCode.detected) {
    ui.ok(`OpenCode detected (${ctx.openCode.signals.join(", ")})`);
  } else {
    ui.warn("OpenCode not detected — the skill will still be copied to the standard location");
  }

  // 3. Target skill directory
  ui.ok(`Skill directory: ${ctx.targetDir} (${ctx.mode})`);

  // 4. --register is a configuration-only action: it applies whether or not
  //    the skill files are already in place, and it prompts before writing.
  if (ctx.register) {
    const rc = await handleRegister(ctx);
    if (rc !== EXIT_OK) return rc;
  }

  // 5. Already installed -> report only, never touch files.
  if (ctx.installed.installed) return reportAlreadyInstalled(ctx);

  const files = walkFiles(ctx.source.dir);
  const srcVersion = ctx.source.skillJson.version;

  // 6. Plan
  ui.step(`Installing ${ctx.skillId} (${files.length} files, version ${srcVersion})`);

  // 7. Another source root may already provide this skill id: confirm before
  //    creating a second copy of it.
  const duplicate = ctx.registration && ctx.registration.conflict && !ctx.registration.registered;
  if (duplicate) {
    const rc = await confirmDuplicate(ctx);
    if (rc !== EXIT_OK) return rc;
  }
  if (!ctx.register) reportConfigStatus(ctx);

  // 8. Dry run stops here.
  if (ctx.dryRun) {
    ui.blank();
    ui.info(`Would install ${files.length} files into ${ctx.targetDir}`);
    ui.out("Dry run — no changes made.");
    return EXIT_OK;
  }

  // 9. Copy + manifest.
  const copied = copyFiles(ctx.source.dir, ctx.targetDir, files);
  writeManifest(ctx.targetDir, {
    skillId: ctx.skillId,
    skillVersion: srcVersion,
    installerVersion: ctx.pkg.version,
    sourceDir: ctx.source.dir,
  });
  ui.ok(`Skill files written to ${ctx.targetDir} (${copied} files)`);
  ui.ok(`Version ${srcVersion}`);

  // 9. Validate.
  const v = validateSkillDir(ctx.targetDir);
  if (!v.ok) {
    ui.blank();
    ui.fail("Installation validation failed:");
    for (const c of v.checks.filter((x) => !x.ok && x.severity === "error")) {
      ui.bullet(`${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    return EXIT_ERROR;
  }
  ui.ok(`Installation validated (${v.fileCount} files)`);

  ui.blank();
  ui.out("Installation complete.");
  ui.blank();
  ui.out("Next steps:");
  ui.blank();
  ui.out("1. Start AutoCAD");
  ui.out("2. Start OpenCode");
  ui.out("3. Ask:");
  ui.out('   "Create a 6000 × 4000 mm room."');
  return EXIT_OK;
}

/** Another skills entry already provides this skill id: warn, then confirm. */
async function confirmDuplicate(ctx) {
  ui.warn(`A skills entry already provides this skill id: ${ctx.registration.conflict}`);
  if (ctx.dryRun) {
    ui.out(`Installing a second copy at ${ctx.targetDir} would create a duplicate skill id.`);
    return EXIT_OK;
  }
  ui.out(`Installing a second copy at ${ctx.targetDir} would create a duplicate skill id.`);
  const q = await needConfirm("Install a second copy anyway?", { yes: ctx.yes });
  if (!q.proceed) {
    ui.blank();
    ui.out(q.hint || "Declined. No changes were made.");
    return EXIT_ABORT;
  }
  return EXIT_OK;
}

/** Already-installed path: report only, never touch files. */
function reportAlreadyInstalled(ctx) {
  const installedVersion = ctx.installed.version;
  const availableVersion = ctx.source.skillJson.version;
  const mods = diffAgainstManifest(ctx.targetDir);

  ui.blank();
  if (installedVersion && installedVersion !== availableVersion) {
    ui.out(`Already installed: v${installedVersion} (available: v${availableVersion}).`);
    ui.out("Run `npx autocad-skill update` to upgrade. No changes were made.");
    return EXIT_OK;
  }

  ui.out(`Already installed: v${installedVersion || "unknown"} — no changes made.`);

  if (mods.manifest === null) {
    ui.warn("No installer manifest found (skill may have been copied by hand); cannot verify file hashes.");
    return EXIT_OK;
  }
  const touched = [...mods.modified, ...mods.added, ...mods.missing];
  if (touched.length === 0) {
    ui.ok(`Installation verified (${Object.keys(mods.manifest.files).length} files match)`);
  } else {
    ui.warn(`${touched.length} locally modified/added/removed file(s) — left untouched:`);
    ui.bulletList(touched.sort());
    ui.out("Run `npx autocad-skill update` to review them against the available version.");
  }
  return EXIT_OK;
}

/** Read-only configuration report for the default (auto-discovery) path. */
function reportConfigStatus(ctx) {
  if (!ctx.configPath) {
    ui.info("Configuration: no opencode.json found — OpenCode will auto-discover .opencode/skills/");
    return;
  }
  if (ctx.registration && ctx.registration.registered) {
    ui.ok("Configuration verified (skill already listed in the skills array)");
    return;
  }
  ui.ok("Configuration verified (no changes required — auto-discovery location)");
}

/** --register: confirm, then append our path to the skills array. */
async function handleRegister(ctx) {
  if (!ctx.configPath) {
    ui.fail("--register requires an existing opencode.json (none found).");
    return EXIT_ERROR;
  }
  const r = ctx.registration;
  if (r && r.registered) {
    ui.ok("Configuration already lists this skill — no change needed.");
    return EXIT_OK;
  }

  if (ctx.dryRun) {
    ui.info(`Would add ${ctx.targetDir} to the skills array in ${path.basename(ctx.configPath)}`);
    return EXIT_OK;
  }

  const q = await needConfirm(
    `Add ${ctx.targetDir} to the skills array in ${path.basename(ctx.configPath)}?`,
    { yes: ctx.yes }
  );
  if (!q.proceed) {
    ui.blank();
    ui.out(q.hint || "Declined. No changes were made.");
    return EXIT_ABORT;
  }

  try {
    const res = registerSkillPath(ctx.configPath, ctx.targetDir);
    if (res.changed) ui.ok(`Configuration updated: skills entry added (backup: ${res.backupPath})`);
    else ui.ok("Configuration already up to date.");
    return EXIT_OK;
  } catch (e) {
    ui.fail(`Configuration update failed: ${e.message}`);
    return EXIT_ERROR;
  }
}

module.exports = { run };
