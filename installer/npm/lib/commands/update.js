"use strict";

/* `autocad-skill update` — compare, show changes, confirm, back up, apply.
 * Also `autocad-skill update --rollback` to restore the most recent backup. */

const fs = require("fs");
const path = require("path");
const ui = require("../ui");
const { buildContext, EXIT_OK, EXIT_ERROR, EXIT_ABORT } = require("../context");
const { walkFiles, copyFiles, removeTree, sha256File, isDir, isFile } = require("../fsx");
const { writeManifest, diffAgainstManifest, compareTrees, MANIFEST_NAME } = require("../manifest");
const { validateSkillDir } = require("../validate");
const { needConfirm } = require("../prompt");

async function run(opts = {}) {
  if (opts.rollback) return rollback(opts);

  ui.header("Engineering CAD Agent Skill update");
  const ctx = buildContext(opts);

  if (ctx.configError) {
    ui.fail(`OpenCode configuration cannot be read: ${ctx.configError.message}`);
    return EXIT_ERROR;
  }

  if (!ctx.installed.installed) {
    ui.fail("Skill is not installed in this project.");
    ui.out("Run `npx autocad-skill install` first.");
    return EXIT_ERROR;
  }

  const currentVersion = ctx.installed.version || "unknown";
  const targetVersion = ctx.source.skillJson.version;
  const cmp = compareTrees(ctx.targetDir, ctx.source.dir);
  const mods = diffAgainstManifest(ctx.targetDir);

  if (cmp.identical) {
    ui.ok(`Up to date: installed files are identical to the available v${targetVersion}.`);
    return EXIT_OK;
  }

  // --- Plan -------------------------------------------------------------
  ui.blank();
  ui.out(`Current version:   ${currentVersion}`);
  ui.out(`Available version: ${targetVersion}  (${classify(currentVersion, targetVersion)})`);
  ui.blank();

  if (cmp.changed.length) {
    ui.out("Files that will be updated:");
    ui.bulletList(cmp.changed);
  }
  if (cmp.added.length) {
    ui.out("Files that will be added:");
    ui.bulletList(cmp.added);
  }
  if (cmp.removed.length) {
    ui.out("Files that will be removed (a copy goes into the backup):");
    ui.bulletList(cmp.removed);
  }

  // Local modification analysis (spec: STOP and enumerate before touching).
  const modified = mods.modified.slice().sort();               // edited after install
  const userAdded = (mods.added || []).filter((rel) => !(rel in cmp.sourceTree)).sort();
  const untrackedOverwritten = (mods.added || []).filter((rel) => rel in cmp.sourceTree).sort();
  const conflicts = modified.filter((m) => cmp.changed.includes(m));

  if (modified.length) {
    ui.blank();
    ui.warn(`STOP: ${modified.length} locally modified file(s) would be overwritten:`);
    ui.bulletList(modified);
    ui.blank();
    ui.out("Your current versions are preserved in the backup created before applying.");
    ui.out("Roll back at any time with: npx autocad-skill update --rollback");
    if (conflicts.length) {
      ui.blank();
      ui.out("Possible conflicts (modified locally AND changed in the new version):");
      ui.bulletList(conflicts);
    }
  }

  if (untrackedOverwritten.length) {
    ui.blank();
    ui.warn("Untracked file(s) that will be replaced by the shipped version:");
    ui.bulletList(untrackedOverwritten);
  }

  if (userAdded.length) {
    ui.blank();
    ui.out("Files you added locally (they are kept):");
    ui.bulletList(userAdded);
  }

  // --- Dry run ----------------------------------------------------------
  if (ctx.dryRun) {
    ui.blank();
    ui.out("Dry run — no changes made.");
    return EXIT_OK;
  }

  // --- Confirmation (default N) -----------------------------------------
  ui.blank();
  ui.out("This update changes Agent behavior.");
  const q = await needConfirm("Apply update?", { yes: ctx.yes });
  if (!q.proceed) {
    ui.out("");
    ui.out(q.hint || "Declined. No changes were made.");
    return EXIT_ABORT;
  }

  // --- Backup -----------------------------------------------------------
  const backupDir = makeBackupDir(ctx, currentVersion);
  copyFiles(ctx.targetDir, backupDir, walkFiles(ctx.targetDir));
  ui.blank();
  ui.ok(`Backup created: ${backupDir}`);

  // --- Apply ------------------------------------------------------------
  const manifestFiles = new Set(Object.keys(mods.manifest ? mods.manifest.files : {}));
  let removed = 0;
  for (const rel of cmp.removed) {
    if (!manifestFiles.has(rel)) continue; // user-created file: never delete
    removeTree(path.join(ctx.targetDir, rel));
    removed++;
  }

  const files = walkFiles(ctx.source.dir);
  copyFiles(ctx.source.dir, ctx.targetDir, files);

  writeManifest(ctx.targetDir, {
    skillId: ctx.skillId,
    skillVersion: targetVersion,
    installerVersion: ctx.pkg.version,
    sourceDir: ctx.source.dir,
    previousVersion: currentVersion,
  });

  ui.ok(`Updated ${files.length} files (removed ${removed}, kept ${userAdded.length} local file(s))`);

  // --- Validate ---------------------------------------------------------
  const v = validateSkillDir(ctx.targetDir);
  if (!v.ok) {
    ui.blank();
    ui.fail("Post-update validation failed:");
    for (const c of v.checks.filter((x) => !x.ok && x.severity === "error")) {
      ui.bullet(`${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    ui.blank();
    ui.out(`Your previous skill version is safe in: ${backupDir}`);
    ui.out("Restore it with: npx autocad-skill update --rollback");
    return EXIT_ERROR;
  }
  ui.ok(`Validated: v${targetVersion}, ${v.fileCount} files`);

  ui.blank();
  ui.out("Update complete.");
  ui.out(`Previous version preserved at: ${backupDir}`);
  ui.out("Roll back with: npx autocad-skill update --rollback");
  return EXIT_OK;
}

function makeBackupDir(ctx, version) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeVersion = String(version).replace(/[^\w.-]/g, "_");
  const dir = path.join(ctx.backupRoot, `${stamp}-v${safeVersion}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** PATCH / MINOR / MAJOR classification (see docs/development.md). */
function classify(from, to) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return "unclassified";
  if (b[0] !== a[0]) return b[0] > a[0] ? "MAJOR" : "older";
  if (b[1] !== a[1]) return b[1] > a[1] ? "MINOR" : "older";
  if (b[2] !== a[2]) return b[2] > a[2] ? "PATCH" : "older";
  return "no version change";
}

/* ------------------------------------------------------------------ rollback */

async function rollback(opts = {}) {
  ui.header("Engineering CAD Agent Skill rollback");
  const ctx = buildContext(opts);

  if (!ctx.installed.installed) {
    ui.fail("Skill is not installed in this project; nothing to roll back.");
    return EXIT_ERROR;
  }
  if (!isDir(ctx.backupRoot)) {
    ui.fail(`No backups found at ${ctx.backupRoot}.`);
    return EXIT_ERROR;
  }
  const candidates = fs.readdirSync(ctx.backupRoot)
    .filter((n) => isDir(path.join(ctx.backupRoot, n)))
    .sort()
    .reverse();
  if (candidates.length === 0) {
    ui.fail(`No backups found at ${ctx.backupRoot}.`);
    return EXIT_ERROR;
  }

  const backupDir = path.join(ctx.backupRoot, candidates[0]);
  const backupManifest = readJsonSafe(path.join(backupDir, MANIFEST_NAME));
  const currentManifest = readJsonSafe(path.join(ctx.targetDir, MANIFEST_NAME));

  ui.blank();
  ui.out(`Most recent backup: ${backupDir}`);
  if (backupManifest) ui.out(`Backup contains version: ${backupManifest.skillVersion}`);
  ui.out(`Current version:     ${ctx.installed.version || "unknown"}`);

  if (ctx.dryRun) {
    ui.blank();
    ui.out("Dry run — no changes made.");
    return EXIT_OK;
  }

  const q = await needConfirm("Restore this backup (overwrites the current skill files)?", { yes: ctx.yes });
  if (!q.proceed) {
    ui.out("");
    ui.out(q.hint || "Declined. No changes were made.");
    return EXIT_ABORT;
  }

  // Files the update added that the backup lacks: remove them, unless the
  // user edited them after the update (never destroy a newer local edit).
  let removed = 0;
  const kept = [];
  if (currentManifest && backupManifest) {
    for (const rel of Object.keys(currentManifest.files)) {
      if (rel in backupManifest.files) continue;
      const p = path.join(ctx.targetDir, rel);
      if (!isFile(p)) continue;
      if (sha256File(p) !== currentManifest.files[rel]) { kept.push(rel); continue; }
      removeTree(p);
      removed++;
    }
  }

  const backupFiles = walkFiles(backupDir);
  copyFiles(backupDir, ctx.targetDir, backupFiles);

  ui.ok(`Restored ${backupFiles.length} files (removed ${removed} added by the update)`);
  if (kept.length) {
    ui.warn("Kept files you edited after the update:");
    ui.bulletList(kept);
  }

  const v = validateSkillDir(ctx.targetDir);
  if (!v.ok) {
    ui.fail("Validation failed after rollback.");
    for (const c of v.checks.filter((x) => !x.ok && x.severity === "error")) {
      ui.bullet(`${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    return EXIT_ERROR;
  }
  const restoredVersion = backupManifest ? backupManifest.skillVersion : (ctx.installed.version || "unknown");
  ui.ok(`Validated: v${restoredVersion}, ${v.fileCount} files`);
  ui.blank();
  ui.out("Rollback complete.");
  return EXIT_OK;
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

module.exports = { run, classify };
