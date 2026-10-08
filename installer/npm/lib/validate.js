"use strict";

/*
 * Post-install / post-update validation.
 *
 * These are structural checks only. They do NOT prove AutoCAD ran: live
 * behavior is Level 4 (PENDING) and is never claimed here.
 */

const fs = require("fs");
const path = require("path");
const { isFile, isDir, walkFiles, sha256File, readJson } = require("./fsx");
const { MANIFEST_NAME, readManifest } = require("./manifest");

const REQUIRED_FILES = ["SKILL.md", "skill.json"];
const REQUIRED_DIRS = ["workflows", "rules", "schemas", "templates"];

/** Validate a skill directory.
 * Returns { ok, checks:[{name,ok,detail,severity}] }.
 * severity "error" fails validation; "warn" is reported but does not fail
 * (e.g. a hand-installed skill with no installer manifest).
 */
function validateSkillDir(dir) {
  const checks = [];
  const add = (name, ok, detail, severity = "error") => checks.push({ name, ok, detail, severity });

  add("directory exists", isDir(dir), dir);

  for (const f of REQUIRED_FILES) {
    add(`${f} present`, isFile(path.join(dir, f)), f);
  }
  for (const d of REQUIRED_DIRS) {
    const p = path.join(dir, d);
    const ok = isDir(p) && walkFiles(p).length > 0;
    add(`${d}/ non-empty`, ok, ok ? undefined : "missing or empty");
  }

  // skill.json must parse and carry the identity fields we rely on.
  let skillJson = null;
  try {
    skillJson = readJson(path.join(dir, "skill.json"));
    add("skill.json parses", true);
    add(
      "skill.json identity",
      Boolean(skillJson && skillJson.id && skillJson.version && skillJson.toolContractVersion !== undefined),
      skillJson ? `id=${skillJson.id} version=${skillJson.version}` : "missing fields"
    );
  } catch (e) {
    add("skill.json parses", false, e.message);
  }

  // SKILL.md frontmatter must exist and declare name + description.
  const skillMd = path.join(dir, "SKILL.md");
  if (isFile(skillMd)) {
    const text = fs.readFileSync(skillMd, "utf8");
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!fm) {
      add("SKILL.md frontmatter", false, "missing YAML frontmatter");
    } else {
      const hasName = /^name:\s*\S/m.test(fm[1]);
      const hasDesc = /^description:\s*\S/m.test(fm[1]);
      add("SKILL.md frontmatter", hasName && hasDesc, hasName && hasDesc ? undefined : "needs name and description");
    }
  }

  // If the installer wrote a manifest, every recorded file must match its hash.
  const manifest = readManifest(dir);
  if (manifest) {
    let mismatched = 0;
    let missing = 0;
    for (const [rel, expected] of Object.entries(manifest.files)) {
      const p = path.join(dir, rel);
      if (!isFile(p)) { missing++; continue; }
      if (sha256File(p) !== expected) mismatched++;
    }
    add(
      "manifest hashes match",
      mismatched === 0 && missing === 0,
      mismatched || missing ? `${missing} missing, ${mismatched} modified` : `${Object.keys(manifest.files).length} files`,
      // Drift from the manifest means local edits, not structural corruption;
      // doctor reports it separately. Structural checks above stay "error".
      "warn"
    );
  } else {
    add("manifest present", false, "no .autocad-skill-manifest.json (files may have been copied by hand)", "warn");
  }

  const ok = checks.every((c) => c.severity !== "error" || c.ok);
  return { ok, checks, skillJson, fileCount: manifest ? Object.keys(manifest.files).length : walkFiles(dir, { excludeNames: [MANIFEST_NAME] }).length };
}

module.exports = { validateSkillDir, REQUIRED_FILES, REQUIRED_DIRS };
