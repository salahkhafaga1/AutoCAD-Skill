"use strict";

/*
 * Install manifest: records what the installer wrote, so a later update can
 * distinguish (a) untouched files, (b) files modified locally by the user,
 * and (c) files the user added on their own.
 *
 * Manifest lives at <targetDir>/.autocad-skill-manifest.json
 */

const fs = require("fs");
const path = require("path");
const { hashTree, walkFiles, sha256File } = require("./fsx");

const MANIFEST_NAME = ".autocad-skill-manifest.json";

function manifestPath(targetDir) {
  return path.join(targetDir, MANIFEST_NAME);
}

function readManifest(targetDir) {
  const p = manifestPath(targetDir);
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!data || typeof data !== "object" || typeof data.files !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Write the install manifest.
 *
 * `files` is normally derived from `sourceDir` (the directory just written).
 * Migration passes its own map instead: it must record, for every file, the
 * hash the *installer* last wrote — which for a carried-over user edit is the
 * old hash, not the user's. That is what keeps a later `update` from
 * mistaking someone's edit for installer output.
 */
function writeManifest(targetDir, { skillId, skillVersion, installerVersion, sourceDir, previousVersion, files }) {
  const tree = files || hashTree(sourceDir, { excludeNames: [MANIFEST_NAME] });
  const manifest = {
    schema: 1,
    skillId,
    skillVersion,
    installerVersion,
    installedAt: new Date().toISOString(),
    files: tree,
  };
  // Only set on an update, so a fresh install manifest stays minimal.
  if (previousVersion) manifest.previousVersion = previousVersion;
  fs.writeFileSync(manifestPath(targetDir), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

/**
 * Build the manifest `files` map after installing `sourceDir` into
 * `targetDir`, preserving who owns what:
 *
 *   - shipped file             -> the hash of the copy just written (ours)
 *   - target-only, previously recorded -> that recorded hash, so an edit keeps
 *                                   reading as an edit after an update
 *   - target-only, unrecorded  -> omitted, so it keeps reading as a file the
 *                                 user added and `update` never deletes it
 *
 * Hashing the whole directory instead would launder user-added files into
 * "installer output", and the next update would then remove them.
 */
function provenanceFiles(targetDir, sourceDir, previousFiles) {
  const prev = previousFiles || {};
  const inSource = new Set(walkFiles(sourceDir, { excludeNames: [MANIFEST_NAME] }));
  const files = {};
  for (const rel of walkFiles(targetDir, { excludeNames: [MANIFEST_NAME] })) {
    if (inSource.has(rel)) files[rel] = sha256File(path.join(targetDir, rel));
    else if (rel in prev) files[rel] = prev[rel];
  }
  return files;
}

/**
 * Compare the installed directory against its manifest.
 * Returns { modified, added, missing } arrays of relative paths.
 */
function diffAgainstManifest(targetDir) {
  const manifest = readManifest(targetDir);
  const current = hashTree(targetDir, { excludeNames: [MANIFEST_NAME] });
  if (!manifest) return { manifest: null, modified: [], added: [], missing: [], current };

  const modified = [];
  const added = [];
  for (const [rel, hash] of Object.entries(current)) {
    if (!(rel in manifest.files)) added.push(rel);
    else if (manifest.files[rel] !== hash) modified.push(rel);
  }
  const missing = Object.keys(manifest.files).filter((rel) => !(rel in current));
  return { manifest, modified, added, missing, current };
}

/**
 * A ready-to-display comparison of two skill trees (installed vs available).
 * Returns { changed, added, removed, identical }.
 */
function compareTrees(installedDir, sourceDir) {
  const a = hashTree(installedDir, { excludeNames: [MANIFEST_NAME] });
  const b = hashTree(sourceDir, { excludeNames: [MANIFEST_NAME] });
  const changed = [];
  const added = [];
  const removed = [];
  for (const [rel, hash] of Object.entries(b)) {
    if (!(rel in a)) added.push(rel);
    else if (a[rel] !== hash) changed.push(rel);
  }
  for (const rel of Object.keys(a)) {
    if (!(rel in b)) removed.push(rel);
  }
  changed.sort();
  added.sort();
  removed.sort();
  return { changed, added, removed, identical: changed.length === 0 && added.length === 0 && removed.length === 0, installedTree: a, sourceTree: b };
}

module.exports = {
  MANIFEST_NAME,
  manifestPath,
  readManifest,
  writeManifest,
  provenanceFiles,
  diffAgainstManifest,
  compareTrees,
};
