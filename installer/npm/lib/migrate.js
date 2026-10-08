"use strict";

/*
 * Migration of installations made by older versions of this package.
 *
 * Two things were wrong with installs made by 0.2.0:
 *
 *   1. The default target was `<home>/.opencode/skills/<id>`, which is not an
 *      OpenCode V2 discovery source in either scope, so the skill was never
 *      advertised and never appeared in the `/` menu.
 *   2. The directory (and therefore the skill id) was `engineering_agent`
 *      instead of `engineering-cad`.
 *
 * Migration rules:
 *   - Copy the old installation into the new location first. The copy is
 *     validated before anything is removed.
 *   - Files the old installer wrote and the user never edited are brought up
 *     to date from the current package. Moving an install is pointless if it
 *     still carries the identity (frontmatter `name`, `skill.json` id) that
 *     the fix exists to replace.
 *   - Everything the user wrote travels untouched: local edits, files the user
 *     added, and files the user deleted. Their provenance travels too — the
 *     new manifest keeps the hash the *installer* last wrote for them, so a
 *     later `update` still sees them as the user's and still asks first.
 *   - The old directory is removed only after an explicit confirmation with
 *     the default [y/N] = N, and only when the copy validated.
 *   - Only the legacy skill directory itself is ever deleted. Sibling skills,
 *     parent directories, and anything else in `~/.opencode` are untouched.
 *   - With a non-interactive stdin the removal is skipped (never aborts the
 *     install) and the path is reported so the user can remove it by hand.
 *
 * When the old copy has no install manifest there is no way to tell installer
 * output from user edits, so nothing is refreshed: the whole copy is carried
 * over as-is and the user is told to review it with `update`.
 *
 * Everything here that writes does so only under the installer's own target
 * or under a directory that was produced by a previous installer run.
 */

const fs = require("fs");
const path = require("path");
const ui = require("./ui");
const { walkFiles, copyFiles, removeTree, hashTree, sha256File } = require("./fsx");
const { writeManifest, readManifest, MANIFEST_NAME } = require("./manifest");
const { validateSkillDir } = require("./validate");
const { confirm } = require("./prompt");
const { readInstalled } = require("./detect");

/** Pick the legacy install with the most files (the most complete copy). */
function pickSource(ctx) {
  let best = null;
  let bestCount = -1;
  for (const dir of ctx.legacyDirs) {
    let count = 0;
    try { count = walkFiles(dir).length; } catch { count = 0; }
    if (count > bestCount) { best = dir; bestCount = count; }
  }
  return best;
}

/**
 * Bring the migrated copy up to date without touching anything the user wrote.
 *
 * A file is *pristine* when it still matches the hash the previous installer
 * recorded for it — the user never edited it. Only pristine files are
 * replaced with the current package content (or dropped, when the package no
 * longer ships them). Everything else is carried over untouched.
 *
 * The returned `manifestFiles` is the provenance map for the new manifest:
 *   - pristine file  -> the hash the installer now wrote (the current source)
 *   - user's file    -> the hash the *previous* installer wrote, if known, so
 *                       it still reads as a local modification later
 *   - user's file with no record -> omitted, so it reads as user-added
 *   - user deleted a file the installer wrote -> the old hash is kept, so the
 *                       deletion is still visible as a deletion
 *
 * Returns { refreshed, dropped, carried, absent, manifestFiles, noManifest }.
 */
function refreshMigratedCopy(ctx, legacyDir) {
  const legacyManifest = readManifest(legacyDir);
  const legacyFiles = legacyManifest && legacyManifest.files ? legacyManifest.files : null;
  const shipped = hashTree(ctx.source.dir, { excludeNames: [MANIFEST_NAME] });

  const refreshed = [];
  const dropped = [];
  const carried = [];
  const absent = [];
  const manifestFiles = {};

  // Files present in the migrated copy.
  for (const rel of walkFiles(ctx.targetDir, { excludeNames: [MANIFEST_NAME] })) {
    const here = sha256File(path.join(ctx.targetDir, rel));
    const recorded = legacyFiles ? legacyFiles[rel] : undefined;
    const pristine = recorded !== undefined && recorded === here;

    if (pristine) {
      const want = shipped[rel];
      if (want === undefined) {
        fs.unlinkSync(path.join(ctx.targetDir, rel));
        dropped.push(rel);
        continue;
      }
      if (want !== here) {
        fs.copyFileSync(path.join(ctx.source.dir, rel), path.join(ctx.targetDir, rel));
        refreshed.push(rel);
      }
      manifestFiles[rel] = want;
      continue;
    }

    // Not pristine: the user owns this file (or there is no record to judge by).
    if (recorded !== undefined) manifestFiles[rel] = recorded;
    if (shipped[rel] !== undefined && shipped[rel] !== here) carried.push(rel);
  }

  // Preserve what the old manifest knew: a file the installer wrote and the
  // user then deleted must still read as a deletion. Entries we removed
  // ourselves (pristine, no longer shipped) are deliberately dropped.
  if (legacyFiles) {
    for (const rel of Object.keys(legacyFiles).sort()) {
      if (dropped.includes(rel) || rel in manifestFiles) continue;
      manifestFiles[rel] = legacyFiles[rel];
    }
  }

  // Files the current package ships that the old copy never had.
  for (const rel of Object.keys(shipped).sort()) {
    const isInstalled = fs.existsSync(path.join(ctx.targetDir, rel));
    const recorded = legacyFiles ? legacyFiles[rel] : undefined;
    if (!isInstalled && recorded === undefined) absent.push(rel);
  }

  return {
    refreshed: refreshed.sort(),
    dropped: dropped.sort(),
    carried: carried.sort(),
    absent: absent.sort(),
    manifestFiles,
    noManifest: !legacyFiles,
  };
}

/** SHA-256 of a single file inside `dir` (manifest excluded by construction). */
function hashTreeLeaf(dir, rel) {
  const { sha256File } = require("./fsx");
  return sha256File(path.join(dir, rel));
}

/** Print what migration did and did not touch. */
function reportRefresh(refresh) {
  ui.blank();
  if (refresh.noManifest) {
    ui.warn("The old copy has no install manifest, so nothing could be told apart from your edits.");
    ui.out("Nothing was overwritten. Run `npx autocad-skill update` to see every difference and");
    ui.out("confirm which files may be replaced.");
    return;
  }
  if (refresh.refreshed.length) {
    ui.ok(`Refreshed ${refresh.refreshed.length} file(s) from the current package`);
    ui.bulletList(refresh.refreshed);
  } else {
    ui.info("Nothing to refresh — the old copy already matched the current package.");
  }
  if (refresh.dropped.length) {
    ui.out(`Removed ${refresh.dropped.length} file(s) the current package no longer ships`);
    ui.bulletList(refresh.dropped);
  }
  if (refresh.carried.length) {
    ui.blank();
    ui.warn(`${refresh.carried.length} file(s) were kept exactly as they were, not overwritten:`);
    ui.bulletList(refresh.carried);
    ui.out("Run `npx autocad-skill update` to review them before they are replaced.");
  }
  if (refresh.absent.length) {
    ui.blank();
    ui.out(`${refresh.absent.length} file(s) in the current package were not in the old copy.`);
    ui.out("Run `npx autocad-skill update` to add them.");
    ui.bulletList(refresh.absent);
  }
}

/**
 * Migrate any legacy installation into ctx.targetDir.
 *
 * Returns { status, removed, kept } with status one of:
 *   "none"       nothing to migrate
 *   "dry-run"    reported what would happen, wrote nothing
 *   "migrated"   copied (and possibly cleaned up) successfully
 *   "failed"     the copy did not validate; the old install is untouched
 */
async function migrate(ctx) {
  if (ctx.installed.installed || !ctx.legacyDirs.length) {
    return { status: "none", removed: [], kept: [] };
  }

  const sourceDir = pickSource(ctx);
  const others = ctx.legacyDirs.filter((d) => d !== sourceDir);

  ui.blank();
  ui.warn(`Found ${ctx.legacyDirs.length} installation(s) at an old location:`);
  ui.bulletList(ctx.legacyDirs.slice().sort());

  if (ctx.dryRun) {
    ui.blank();
    ui.out(`Would migrate ${sourceDir}`);
    ui.out(`             to ${ctx.targetDir}`);
    ui.out("Would refresh every file the old installer wrote and you never edited, and keep");
    ui.out("your edits, added files, and deletions exactly as they are.");
    ui.out("Then ask before removing the old directory (default [y/N] = N).");
    return { status: "dry-run", removed: [], kept: ctx.legacyDirs };
  }

  // --- copy (non-destructive) -------------------------------------------
  const files = walkFiles(sourceDir);
  const legacyVersion = readInstalled(sourceDir).version || ctx.source.skillJson.version;
  copyFiles(sourceDir, ctx.targetDir, files);
  ui.blank();
  ui.step(`Migrating ${files.length} files from ${sourceDir}`);
  ui.out(`          to ${ctx.targetDir}`);

  // The copy has to be a real skill before we do anything else with it.
  const before = validateSkillDir(ctx.targetDir);
  if (!before.ok) return failMigration(ctx, before, "Migration validation failed");

  // --- refresh what the user never touched, keep what they did ------------
  const refresh = refreshMigratedCopy(ctx, sourceDir);
  const migratedVersion = readInstalled(ctx.targetDir).version || legacyVersion;

  writeManifest(ctx.targetDir, {
    skillId: ctx.skillId,
    skillVersion: migratedVersion,
    installerVersion: ctx.pkg.version,
    sourceDir,
    previousVersion: legacyVersion,
    files: refresh.manifestFiles,
  });

  // --- validate the final state before removing anything -----------------
  const v = validateSkillDir(ctx.targetDir);
  if (!v.ok) return failMigration(ctx, v, "Post-migration validation failed");

  ui.ok(`Migrated and validated (${v.fileCount} files, version ${migratedVersion})`);
  reportRefresh(refresh);

  if (others.length) {
    ui.blank();
    ui.info("Other old copies were not migrated and were left in place:");
    ui.bulletList(others.slice().sort());
  }

  // --- optional cleanup of the directory we just migrated ----------------
  ui.blank();
  ui.out(`The old copy at ${sourceDir}`);
  ui.out("can now be removed. Nothing outside that directory is ever touched.");
  const remove = await confirm("Remove the old installation?", { yes: ctx.yes });

  const removed = [];
  const kept = [];
  if (remove) {
    removeTree(sourceDir);
    removed.push(sourceDir);
    ui.ok(`Removed ${sourceDir}`);
  } else {
    kept.push(sourceDir);
    ui.info(`Kept ${sourceDir} — delete it manually when you are ready.`);
  }

  return { status: "migrated", removed, kept: [...kept, ...others] };
}

/** Validation failed: drop the copy we just made, leave the old install alone. */
function failMigration(ctx, v, label) {
  removeTree(ctx.targetDir);
  ui.fail(`${label} — the old installation was left untouched.`);
  for (const c of v.checks.filter((x) => !x.ok && x.severity === "error")) {
    ui.bullet(`${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  return { status: "failed", removed: [], kept: ctx.legacyDirs };
}

/** Read-only report used by `doctor` and by `update` when nothing is installed. */
function reportLegacy(ctx) {
  if (!ctx.legacyDirs.length) return false;
  ui.warn(`Installation(s) found at an old location: ${ctx.legacyDirs.join(", ")}`);
  ui.out("Run `npx autocad-skill install` to migrate them.");
  return true;
}

module.exports = { migrate, reportLegacy, pickSource, refreshMigratedCopy };
