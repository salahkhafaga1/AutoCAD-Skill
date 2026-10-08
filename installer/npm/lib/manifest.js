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
const { hashTree, walkFiles } = require("./fsx");

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

function writeManifest(targetDir, { skillId, skillVersion, installerVersion, sourceDir, previousVersion }) {
  const files = hashTree(sourceDir, { excludeNames: [MANIFEST_NAME] });
  const manifest = {
    schema: 1,
    skillId,
    skillVersion,
    installerVersion,
    installedAt: new Date().toISOString(),
    files,
  };
  // Only set on an update, so a fresh install manifest stays minimal.
  if (previousVersion) manifest.previousVersion = previousVersion;
  fs.writeFileSync(manifestPath(targetDir), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
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
  diffAgainstManifest,
  compareTrees,
};
