"use strict";

/* Filesystem helpers: walking, hashing, copying, comparing. Zero dependencies. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Recursively list files under `dir` as sorted paths relative to `dir`.
 * `excludeNames` drops entries by basename at any depth (e.g. the manifest).
 */
function walkFiles(dir, { excludeNames = [] } = {}) {
  const skip = new Set(excludeNames);
  const results = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(dir, rel) : dir;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) stack.push(childRel);
      else if (entry.isFile()) results.push(childRel);
    }
  }
  return results.sort();
}

/** SHA-256 of a file, hex. */
function sha256File(absPath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absPath));
  return hash.digest("hex");
}

/** SHA-256 over a string. */
function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** { relPath: sha256 } for every file under `dir`. */
function hashTree(dir, opts) {
  const out = {};
  for (const rel of walkFiles(dir, opts)) out[rel] = sha256File(path.join(dir, rel));
  return out;
}

function exists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Recursively copy a directory (node >= 16.7). */
function copyTree(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

/**
 * Copy an explicit file list (relative paths) from `src` to `dst`,
 * creating parent directories as needed. Deterministic merge/overwrite.
 * Returns the number of files copied.
 */
function copyFiles(src, dst, relPaths) {
  let n = 0;
  for (const rel of relPaths) {
    const to = path.join(dst, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, rel), to);
    n++;
  }
  return n;
}

/** Copy every file under `src` into `dst` (merging/overwriting). Returns file list. */
function copyTreeFiles(src, dst, opts) {
  const files = walkFiles(src, opts);
  copyFiles(src, dst, files);
  return files;
}

function removeTree(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

module.exports = {
  walkFiles, sha256, sha256File, hashTree,
  exists, isDir, isFile, readJson, writeJson,
  copyTree, copyFiles, copyTreeFiles, removeTree,
};
