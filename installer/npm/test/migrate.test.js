"use strict";

/* Migration of installations created by older versions of the installer.
 *
 * Those installs landed in <home>/.opencode/skills/engineering_agent — a
 * directory OpenCode V2 never searches — with the wrong skill id, and with
 * the identity (`name`, `skill.json.id`) that this fix replaces.
 *
 * Migration therefore has two jobs, and every test here pins one of them:
 *   - files the old installer wrote and the user never edited come out
 *     refreshed, so the skill presents the new identity;
 *   - files the user edited, added, or deleted come out exactly as they were,
 *     and stay flagged as the user's so `update` still has to ask first.
 *
 * Every test here gives the CLI a throwaway AUTOCAD_SKILL_HOME, so nothing in
 * this file can read or write a real machine's skill folders. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const {
  runCli, makeProject, fakeHome, globalTargetOf, tempDir, treeHashes,
  REPO_SKILL, rmrf, writeLegacyManifest, downgradeToOldIdentity, makeSkillSource,
} = require("./helpers");

/**
 * Seed a fake old installation under `home` (the broken pre-fix location),
 * in the order a real 0.2.0 install was built:
 *
 *   1. the skill files as the old installer shipped them
 *   2. the manifest it recorded for them
 *   3. only then anything of the user's own — so their files are correctly
 *      *not* in the manifest, which is exactly how migration recognises them
 *
 *   edit        append to SKILL.md — a file the user changed themselves
 *   extraFile   add a file the installer never shipped
 *   manifest    false for a hand-copied skill that has no manifest at all
 *   identity    false to leave the current frontmatter/skill.json as-is
 */
function seedLegacy(home, { edit = false, extraFile = false, manifest = true, identity = true } = {}) {
  const legacy = path.join(home, ".opencode", "skills", "engineering_agent");
  fs.mkdirSync(legacy, { recursive: true });
  fs.cpSync(REPO_SKILL, legacy, { recursive: true });
  if (identity) downgradeToOldIdentity(legacy);
  if (manifest) writeLegacyManifest(legacy);
  if (edit) fs.appendFileSync(path.join(legacy, "SKILL.md"), "\n<!-- my local edit -->\n");
  if (extraFile) fs.writeFileSync(path.join(legacy, "my-notes.md"), "kept\n");
  return legacy;
}

test("install migrates a broken home install into the documented global source", async (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home, { edit: true, extraFile: true });
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  const r = runCli(["install"], { cwd: project, env });
  assert.strictEqual(r.status, 0, r.output);

  const target = globalTargetOf(home);
  assert.ok(fs.existsSync(path.join(target, "SKILL.md")), "migrated into the global skills source");
  assert.ok(
    fs.existsSync(path.join(target, "my-notes.md")),
    "user-added file travels with the migration"
  );
  assert.ok(
    fs.readFileSync(path.join(target, "SKILL.md"), "utf8").includes("<!-- my local edit -->"),
    "locally modified file travels with the migration"
  );

  // Non-interactive: the removal prompt declines, the install still succeeds.
  assert.strictEqual(r.status, 0, "migration must not abort without a terminal");
  assert.ok(fs.existsSync(legacy), "old copy kept when the prompt cannot be answered");
  assert.match(r.stdout, /can now be removed/);
  assert.match(r.stdout, /Kept .*engineering_agent/);
  assert.match(r.stdout, /Installation complete \(migrated from an old location\)\./);
  assert.match(r.stdout, /@engineering-cad/);
});

test("install --yes migrates and then removes the old copy, leaving siblings alone", async (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home);
  // An unrelated skill living next to the old install must survive.
  const sibling = path.join(home, ".opencode", "skills", "other-skill");
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(sibling, "SKILL.md"), "---\nname: other\n---\nOther\n");
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install", "--yes"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);

  assert.strictEqual(fs.existsSync(legacy), false, "old copy removed with --yes");
  assert.ok(fs.existsSync(path.join(sibling, "SKILL.md")), "sibling skill untouched");
  assert.ok(
    fs.existsSync(path.join(home, ".opencode", "skills")),
    "parent directory is never deleted"
  );
  assert.ok(fs.existsSync(path.join(globalTargetOf(home), "SKILL.md")), "new install present");
  assert.match(r.stdout, /Removed .*engineering_agent/);
});

test("migration validates the copy before anything is removed", async (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home, { edit: true });
  t.after(() => { rmrf(project); rmrf(home); });

  // --yes would happily delete: the safety net has to be the validation step.
  const r = runCli(["install", "--yes"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(fs.existsSync(path.join(globalTargetOf(home), "SKILL.md")));
  assert.ok(fs.existsSync(path.join(globalTargetOf(home), "rules")), "required directories present");
  assert.strictEqual(fs.existsSync(legacy), false, "removed only after a valid copy");
});

test("an installation at the new location is never overwritten by a legacy copy", async (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install", "--yes"], { cwd: project, env }).status, 0);

  const target = globalTargetOf(home);
  const before = treeHashes(target);

  const legacy = seedLegacy(home);
  const again = runCli(["install", "--yes"], { cwd: project, env });
  assert.strictEqual(again.status, 0, again.output);
  assert.deepStrictEqual(treeHashes(target), before, "existing install untouched");
  assert.match(again.stdout, /Already installed/);
  assert.ok(fs.existsSync(legacy), "legacy copy left alone when the new one exists");
});

test("project scope migrates that project's own old install", (t) => {
  const project = makeProject();
  t.after(() => rmrf(project));

  const legacy = path.join(project, ".opencode", "skills", "engineering_agent");
  fs.mkdirSync(legacy, { recursive: true });
  fs.cpSync(REPO_SKILL, legacy, { recursive: true });

  const r = runCli(["install", "--project", project]);
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(
    fs.existsSync(path.join(project, ".opencode", "skills", "engineering-cad", "SKILL.md")),
    "migrated inside the project"
  );
  assert.ok(fs.existsSync(legacy), "old project copy kept without consent");
});

test("project scope does not pull a home-level install into the project", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  const legacy = seedLegacy(home);
  const r = runCli(["install", "--project", project], { env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(fs.existsSync(legacy), "home install belongs to the global scope");
  assert.strictEqual(fs.existsSync(globalTargetOf(home)), false, "global source untouched");
  assert.ok(fs.existsSync(path.join(project, ".opencode", "skills", "engineering-cad", "SKILL.md")));
});

test("doctor reports a leftover legacy install as a warning, not an error", (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home);
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["doctor"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Legacy install .*found at .*engineering_agent/);
  assert.match(r.stdout, /Result: no errors\./);
  assert.match(r.stdout, /Skill discovery .*is a documented OpenCode source/);
  assert.ok(fs.existsSync(legacy), "doctor is read-only");
});

test("doctor calls a migrated copy a leftover, not something to migrate again", (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home);
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install"], { cwd: project, env }).status, 0);

  const d = runCli(["doctor"], { cwd: project, env });
  assert.strictEqual(d.status, 0, d.output);
  assert.match(
    d.stdout,
    /Legacy install .*leftover at .*engineering_agent.*already migrated/,
    "after a migration the advice must not send the user back to `install`"
  );
  assert.match(d.stdout, /Result: no errors\./);
  assert.ok(fs.existsSync(legacy), "doctor is read-only");
});

test("a legacy install shows up in a dry run but changes nothing", (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home);
  t.after(() => { rmrf(project); rmrf(home); });

  const before = treeHashes(home);
  const r = runCli(["install", "--dry-run", "--yes"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.stdout, /Found 1 installation\(s\) at an old location/);
  assert.match(r.stdout, /Would migrate/);
  assert.match(r.stdout, /Dry run — no changes made\./);
  assert.deepStrictEqual(treeHashes(home), before, "nothing written");
  assert.ok(fs.existsSync(legacy));
});

test("update explains a legacy install instead of failing blind", (t) => {
  const project = makeProject();
  const home = fakeHome();
  seedLegacy(home);
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["update"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /old location/);
  assert.match(r.output, /npx autocad-skill install/);
});

test("migration only ever reports skill directories, never their parents", (t) => {
  const project = makeProject();
  const home = fakeHome();
  t.after(() => { rmrf(project); rmrf(home); });

  // A stray file in the legacy skills root must not be reported or removed.
  const root = path.join(home, ".opencode", "skills");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "not a skill\n");
  seedLegacy(home, { edit: true });

  const r = runCli(["install", "--yes"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(fs.existsSync(path.join(root, "README.md")), "unrelated file untouched");
  assert.strictEqual(fs.existsSync(path.join(root, "engineering_agent")), false);
  assert.ok(fs.existsSync(path.join(root, "README.md")), "legacy skills root kept");
});

test("migration refreshes files the old installer wrote and the user never edited", (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home);
  t.after(() => { rmrf(project); rmrf(home); });

  assert.strictEqual(
    JSON.parse(fs.readFileSync(path.join(legacy, "skill.json"), "utf8")).id,
    "engineering_agent",
    "the seeded copy really carries the old identity"
  );

  const r = runCli(["install"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);

  const target = globalTargetOf(home);
  const md = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
  assert.match(md, /^name:\s*engineering-cad\s*$/m, "frontmatter refreshed to the new name");
  const sj = JSON.parse(fs.readFileSync(path.join(target, "skill.json"), "utf8"));
  assert.strictEqual(sj.id, "engineering-cad", "skill.json id refreshed");
  assert.strictEqual(sj.name, "Engineering CAD Agent", "skill.json name refreshed");

  assert.match(r.stdout, /Refreshed 2 file\(s\) from the current package/);
  assert.match(r.stdout, /SKILL\.md/);
  assert.match(r.stdout, /skill\.json/);
  assert.ok(fs.existsSync(legacy), "nothing removed without consent");

  // The result must be indistinguishable from a fresh install (manifest
  // excluded: it records timestamps and the source path).
  const fresh = freshInstall();
  t.after(() => rmrf(fresh.home));
  assert.deepStrictEqual(
    withoutManifest(target),
    withoutManifest(globalTargetOf(fresh.home)),
    "migrated copy matches a fresh install"
  );
});

/** Tree hashes with the installer manifest removed, for like-for-like diffs. */
function withoutManifest(dir) {
  const tree = treeHashes(dir);
  delete tree[".autocad-skill-manifest.json"];
  return tree;
}

/** A fresh install in its own throwaway home, for byte-level comparison. */
function freshInstall() {
  const project = makeProject();
  const home = fakeHome();
  const r = runCli(["install"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  if (r.status !== 0) throw new Error(r.output);
  rmrf(project);
  return { home };
}

test("migration keeps a user's edit and still reports it as their edit afterwards", (t) => {
  const project = makeProject();
  const home = fakeHome();
  const legacy = seedLegacy(home, { edit: true });
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install", "--yes"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);

  const md = fs.readFileSync(path.join(globalTargetOf(home), "SKILL.md"), "utf8");
  assert.match(md, /<!-- my local edit -->/, "the edit survives");
  assert.match(
    md,
    /^name:\s*engineering-cad-agent\s*$/m,
    "an edited file is never overwritten, not even for the new identity"
  );
  assert.match(r.stdout, /1 file\(s\) were kept exactly as they were, not overwritten/);
  assert.match(r.stdout, /SKILL\.md/);
  assert.match(r.stdout, /autocad-skill update/);

  // Provenance survived the move: doctor still calls it a local modification.
  const d = runCli(["doctor"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(d.status, 0, d.output);
  assert.match(d.stdout, /Local modifications .*1 modified/);
});

test("a user-added file stays out of the manifest, so update still has to ask", (t) => {
  const project = makeProject();
  const home = fakeHome();
  seedLegacy(home, { extraFile: true });
  t.after(() => { rmrf(project); rmrf(home); });

  const env = { AUTOCAD_SKILL_HOME: home };
  assert.strictEqual(runCli(["install", "--yes"], { cwd: project, env }).status, 0);
  assert.ok(fs.existsSync(path.join(globalTargetOf(home), "my-notes.md")), "user file kept");

  const d = runCli(["doctor"], { cwd: project, env });
  assert.strictEqual(d.status, 0, d.output);
  assert.match(d.stdout, /Local modifications .*1 added/);
  assert.match(d.stdout, /Skill integrity/);
});

test("a legacy copy with no install manifest is carried over untouched", (t) => {
  const project = makeProject();
  const home = fakeHome();
  seedLegacy(home, { manifest: false });
  t.after(() => { rmrf(project); rmrf(home); });

  const r = runCli(["install"], { cwd: project, env: { AUTOCAD_SKILL_HOME: home } });
  assert.strictEqual(r.status, 0, r.output);

  const md = fs.readFileSync(path.join(globalTargetOf(home), "SKILL.md"), "utf8");
  assert.match(
    md,
    /^name:\s*engineering-cad-agent\s*$/m,
    "nothing is overwritten when provenance is unknown"
  );
  assert.match(r.stdout, /no install manifest/);
  assert.match(r.stdout, /Nothing was overwritten/);
});

test("a pristine file the current package no longer ships is dropped", (t) => {
  const project = makeProject();
  const home = fakeHome();
  seedLegacy(home);
  const src = makeSkillSource({
    mutate: (dir) => fs.unlinkSync(path.join(dir, "templates", "assumptions.template.md")),
  });
  t.after(() => { rmrf(project); rmrf(home); rmrf(path.dirname(src)); });

  const env = { AUTOCAD_SKILL_HOME: home, AUTOCAD_SKILL_SOURCE: src };
  const r = runCli(["install"], { cwd: project, env });
  assert.strictEqual(r.status, 0, r.output);

  assert.strictEqual(
    fs.existsSync(path.join(globalTargetOf(home), "templates", "assumptions.template.md")),
    false,
    "file no longer shipped by the package is dropped"
  );
  assert.match(r.stdout, /Removed 1 file\(s\) the current package no longer ships/);

  // Its record goes with it: doctor must not call it a user deletion.
  const d = runCli(["doctor"], { cwd: project, env });
  assert.strictEqual(d.status, 0, d.output);
  assert.match(d.stdout, /Local modifications none/);
});

test("files the package ships that the old copy never had are left to update", (t) => {
  const project = makeProject();
  const home = fakeHome();
  seedLegacy(home);
  const src = makeSkillSource({
    mutate: (dir) => fs.writeFileSync(path.join(dir, "templates", "brand-new.template.md"), "new\n"),
  });
  t.after(() => { rmrf(project); rmrf(home); rmrf(path.dirname(src)); });

  const env = { AUTOCAD_SKILL_HOME: home, AUTOCAD_SKILL_SOURCE: src };
  const r = runCli(["install"], { cwd: project, env });
  assert.strictEqual(r.status, 0, r.output);

  assert.strictEqual(
    fs.existsSync(path.join(globalTargetOf(home), "templates", "brand-new.template.md")),
    false,
    "migration moves, it does not add new content on its own"
  );
  assert.match(r.stdout, /1 file\(s\) in the current package were not in the old copy/);
  assert.match(r.stdout, /autocad-skill update/);
});
