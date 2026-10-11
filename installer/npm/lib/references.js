"use strict";

/* Reference library foundation (P0.1): manifest schema, library discovery,
 * path safety, and diagnostics data.
 *
 * Everything here is READ-ONLY: nothing creates, modifies, or deletes
 * reference documents, manifests, indexes, or configuration files.
 * This phase never reads PDF contents — file checks are existence /
 * readability probes (stat + access) only. No extraction, OCR, or indexing.
 */

const fs = require("fs");
const path = require("path");
const { exists, isDir, isFile } = require("./fsx");
const { homeDir } = require("./detect");

const MANIFEST_NAME = "references.json";

/* Stable reference ids: lowercase kebab-case, so an id is safe as a
 * directory/file name segment for future index artifacts. */
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* Document categories. `code` means a mandatory engineering code in some
 * jurisdiction; everything else is explicitly NOT a substitute for one. */
const KINDS = new Set(["code", "standard", "handbook", "manufacturer", "educational", "other"]);

const OPTIONAL_STRING_FIELDS = ["title", "author", "edition", "jurisdiction"];
const KNOWN_FIELDS = new Set(["id", "path", "kind", "year", ...OPTIONAL_STRING_FIELDS]);

/* ------------------------------------------------------------ locations --- */

/**
 * Global (user-level) reference library root.
 *
 * Follows the same home-resolution convention as every other global path in
 * this package (AUTOCAD_SKILL_HOME override, then XDG_CONFIG_HOME, then
 * <home>/.config) so the test suite stays hermetic and behavior stays
 * identical on every OS. This deliberately differs from the %APPDATA%
 * sketch in docs/reference-system-plan.md: %APPDATA% is Windows-only and
 * would bypass the test-home override.
 */
function globalReferencesDir(home) {
  const baseHome = home || homeDir();
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? path.resolve(xdg.trim()) : path.join(baseHome, ".config");
  return path.join(base, "autocad-skill", "references");
}

/** Project-local reference library root (plan §7.1, unchanged). */
function projectReferencesDir(projectRoot) {
  return path.join(path.resolve(projectRoot), ".opencode", "references");
}

/* --------------------------------------------------------------- schema --- */

/**
 * Validate parsed manifest data.
 * Returns { entries, errors, warnings }.
 * `errors` reject the manifest (actionable strings); `warnings` are
 * non-fatal (unknown fields). Entries carry normalized metadata plus any
 * fatal entry problem in `entry.invalid`.
 */
function validateManifest(data) {
  const errors = [];
  const warnings = [];
  const entries = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { entries, errors: [`manifest root must be an object with a "references" array`], warnings };
  }
  if (!Array.isArray(data.references)) {
    return { entries, errors: [`manifest "references" must be an array of entries`], warnings };
  }

  const seen = new Map();
  data.references.forEach((raw, i) => {
    const where = `references[${i}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`${where}: entry must be an object`);
      return;
    }
    const entry = { index: i, id: null, relPath: null, meta: {}, invalid: null, unknownFields: [] };

    if (typeof raw.id !== "string" || !raw.id.trim()) {
      errors.push(`${where}.id: required non-empty string id (lowercase kebab-case, e.g. "ecp203-2025")`);
      entry.invalid = "missing id";
    } else if (!ID_RE.test(raw.id)) {
      errors.push(`${where}.id: "${raw.id}" must match ${ID_RE} (lowercase kebab-case)`);
      entry.invalid = "bad id";
    } else {
      entry.id = raw.id;
      if (seen.has(raw.id)) {
        errors.push(`duplicate id "${raw.id}" (references[${seen.get(raw.id)}] and ${where})`);
      } else {
        seen.set(raw.id, i);
      }
    }

    if (typeof raw.path !== "string" || !raw.path.trim()) {
      errors.push(`${where}.path: required non-empty string path to the reference file`);
      entry.invalid = entry.invalid || "missing path";
    } else {
      entry.relPath = raw.path;
    }

    for (const f of OPTIONAL_STRING_FIELDS) {
      if (raw[f] === undefined) continue;
      if (typeof raw[f] !== "string") {
        errors.push(`${where}.${f}: must be a string`);
      } else {
        entry.meta[f] = raw[f];
      }
    }
    if (raw.year !== undefined) {
      if (typeof raw.year !== "number" || !Number.isInteger(raw.year)) {
        errors.push(`${where}.year: must be an integer publication year`);
      } else {
        entry.meta.year = raw.year;
      }
    }
    if (raw.kind !== undefined) {
      if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) {
        errors.push(`${where}.kind: must be one of ${[...KINDS].join(", ")}`);
      } else {
        entry.meta.kind = raw.kind;
      }
    }
    for (const key of Object.keys(raw)) {
      if (!KNOWN_FIELDS.has(key)) {
        entry.unknownFields.push(key);
        warnings.push(`${where}: unknown field "${key}" (ignored — reserved for later phases)`);
      }
    }

    entries.push(entry);
  });

  return { entries, errors, warnings };
}

/* ----------------------------------------------------------- path safety --- */

/** True when `abs` stays inside `root` (case-insensitive on Windows). */
function isWithinRoot(root, abs) {
  const normRoot = path.resolve(root);
  const normAbs = path.resolve(abs);
  const rel = path.relative(normRoot, normAbs);
  if (rel === "") return true;
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  if (process.platform === "win32") {
    return normAbs.toLowerCase().startsWith(normRoot.toLowerCase() + path.sep) ||
      normAbs.toLowerCase() === normRoot.toLowerCase();
  }
  return normAbs.startsWith(normRoot + path.sep);
}

/**
 * Resolve one manifest path against its library root.
 *
 * Policy (plan §5.1/§7.1): relative paths must stay inside the root —
 * anything escaping via `..` is rejected. Absolute paths are allowed but
 * flagged `external: true` (non-portable; this is how files that live
 * outside both roots, e.g. an existing local collection, are registered
 * without moving them). Nothing is created or moved, ever.
 */
function resolveRefPath(libDir, relPath) {
  if (path.isAbsolute(relPath)) {
    return { abs: path.normalize(relPath), external: true, ok: true, reason: null };
  }
  const abs = path.resolve(libDir, relPath);
  if (!isWithinRoot(libDir, abs)) {
    return { abs, external: false, ok: false, reason: "path escapes the library root" };
  }
  return { abs, external: false, ok: true, reason: null };
}

/** Existence/readability probe only — never opens PDF content. */
function probeFile(abs) {
  if (!exists(abs)) return "missing";
  if (!isFile(abs)) return "not-a-file";
  try {
    fs.accessSync(abs, fs.constants.R_OK);
  } catch {
    return "inaccessible";
  }
  return "ok";
}

/** SHA-256 of a file, streaming (large scans stay cheap). Null when unreadable. */
function sha256File(abs) {
  try {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(abs));
    return hash.digest("hex");
  } catch {
    return null;
  }
}

/**
 * Index freshness for one inspected library (P0.4, read-only).
 * Only entries whose file is available are checked; manifest problems are
 * reported by the manifest section, not here. Returns
 * { fresh, stale, missing, orphaned } as id lists.
 */
function indexStatus(report) {
  const fresh = [], stale = [], missing = [], orphaned = [];
  const idxRoot = path.join(report.dir, ".index");
  let subdirs = [];
  try {
    subdirs = fs.readdirSync(idxRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    subdirs = [];
  }
  const manifestIds = new Set(report.entries.map((e) => e.id).filter(Boolean));
  for (const dir of subdirs) {
    if (!manifestIds.has(dir)) orphaned.push(dir);
  }
  for (const entry of report.entries) {
    if (!entry.id || entry.status !== "ok") continue;
    const docPath = path.join(idxRoot, entry.id, "doc.json");
    let doc = null;
    try {
      doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
    } catch {
      missing.push(entry.id);
      continue;
    }
    const current = sha256File(entry.abs);
    if (current && doc && doc.sha256 === current) fresh.push(entry.id);
    else stale.push(entry.id);
  }
  return { fresh, stale, missing, orphaned };
}

/* ------------------------------------------------------------ inspection --- */

/** Inspect one library root. Never writes. Never reads file contents. */
function inspectLibrary(scope, dir) {
  const report = {
    scope, dir, dirExists: isDir(dir),
    manifest: { present: false, path: path.join(dir, MANIFEST_NAME), valid: false, errors: [], warnings: [] },
    entries: [],
  };
  if (!report.dirExists) return report;

  const manifestPath = path.join(dir, MANIFEST_NAME);
  if (!isFile(manifestPath)) return report;
  report.manifest.present = true;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    report.manifest.errors.push(`references.json is not valid JSON: ${e.message}`);
    return report;
  }

  const v = validateManifest(data);
  report.manifest.errors = v.errors;
  report.manifest.warnings = v.warnings;
  report.manifest.valid = v.errors.length === 0;

  for (const entry of v.entries) {
    const rec = {
      index: entry.index, id: entry.id, relPath: entry.relPath,
      abs: null, external: false, status: "invalid", meta: entry.meta,
      problems: [],
    };
    if (entry.invalid) {
      rec.problems.push(entry.invalid);
      report.entries.push(rec);
      continue;
    }
    const r = resolveRefPath(dir, entry.relPath);
    rec.abs = r.abs;
    rec.external = r.external;
    if (!r.ok) {
      rec.status = "escape";
      rec.problems.push(r.reason);
      report.entries.push(rec);
      continue;
    }
    rec.status = probeFile(r.abs);
    if (rec.status !== "ok") rec.problems.push(rec.status);
    report.entries.push(rec);
  }
  return report;
}

/**
 * Inspect both libraries and surface cross-scope id conflicts.
 * Duplicate ids are reported — never silently resolved, even when both
 * sides point at the same file.
 */
function inspectReferences(projectRoot) {
  const global = inspectLibrary("global", globalReferencesDir());
  const project = inspectLibrary("project", projectReferencesDir(projectRoot));
  const byId = new Map();
  for (const rep of [global, project]) {
    for (const e of rep.entries) {
      if (!e.id) continue;
      if (!byId.has(e.id)) byId.set(e.id, []);
      byId.get(e.id).push(rep.scope);
    }
  }
  const duplicates = [...byId.entries()]
    .filter(([, scopes]) => new Set(scopes).size > 1)
    .map(([id, scopes]) => ({ id, scopes: [...new Set(scopes)] }));
  return { global, project, duplicates };
}

module.exports = {
  MANIFEST_NAME, ID_RE, KINDS,
  globalReferencesDir, projectReferencesDir,
  validateManifest, isWithinRoot, resolveRefPath, probeFile,
  inspectLibrary, inspectReferences, indexStatus,
};
