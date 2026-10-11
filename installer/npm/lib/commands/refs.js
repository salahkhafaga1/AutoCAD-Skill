"use strict";

/* `autocad-skill refs` — reference-library bootstrap and status.
 *
 * Read-only by default: `refs` prints where the global and project
 * libraries live and whether their manifests exist. `refs init` creates
 * the empty skeleton (library directory plus an empty references.json)
 * for the active scope. init never overwrites: an existing manifest is
 * left untouched and reported. --dry-run prints the plan and changes
 * nothing.
 *
 * Exit codes: 0 success · 1 error · 2 aborted (shared with bin).
 */

const path = require("path");
const ui = require("../ui");
const { scopeIsGlobal } = require("../context");
const { homeDir, findProjectRoot } = require("../detect");
const { globalReferencesDir, projectReferencesDir, inspectLibrary } = require("../references");
const { isDir, isFile, writeJson } = require("../fsx");

function resolveRoots(opts = {}) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  let startDir = cwd;
  if (opts.project) {
    startDir = path.resolve(cwd, opts.project);
    if (!isDir(startDir)) {
      const err = new Error(`--project path is not an existing directory: ${startDir}`);
      err.code = "EBADPROJECT";
      throw err;
    }
  }
  const project = findProjectRoot(startDir);
  return {
    projectRoot: project.root,
    global: scopeIsGlobal(opts),
    globalDir: globalReferencesDir(),
    projectDir: projectReferencesDir(project.root),
    home: homeDir(),
  };
}

function describe(dir) {
  const rep = inspectLibrary("refs", dir);
  if (!rep.dirExists) return "absent (not created)";
  if (!rep.manifest.present) return "directory exists, no references.json";
  if (!rep.manifest.valid) return `invalid manifest: ${rep.manifest.errors[0]}`;
  return `${rep.entries.length} reference(s) registered`;
}

function run(opts = {}) {
  const args = opts._ || [];
  const action = args[1] === "init" || opts.init ? "init" : "status";
  const dryRun = Boolean(opts.dryRun);

  let roots;
  try {
    roots = resolveRoots(opts);
  } catch (e) {
    ui.err(e.message);
    return 1;
  }

  if (action === "status") {
    ui.header("Reference libraries");
    ui.out(`Global:  ${roots.globalDir}`);
    ui.out(`  ${describe(roots.globalDir)}`);
    ui.out(`Project: ${roots.projectDir}`);
    ui.out(`  ${describe(roots.projectDir)}`);
    ui.blank();
    ui.out("Run `autocad-skill refs init` to scaffold the active scope.");
    ui.out(`Active scope: ${roots.global ? "global" : "project"} (home: ${roots.home})`);
    return 0;
  }

  // --- init ---------------------------------------------------------------
  const dir = roots.global ? roots.globalDir : roots.projectDir;
  const manifestPath = path.join(dir, "references.json");

  ui.header(`Reference library init (${roots.global ? "global" : "project"})`);
  ui.out(`Directory: ${dir}`);
  if (dryRun) {
    ui.out("Dry run — no changes made.");
    return 0;
  }

  if (isFile(manifestPath)) {
    ui.out("Manifest already exists — left untouched. Nothing to do.");
    ui.out(`Status: ${describe(dir)}`);
    return 0;
  }

  writeJson(manifestPath, { references: [] });
  ui.ok(`Created ${manifestPath} with 0 references.`);
  ui.blank();
  ui.out("Next steps:");
  ui.out("  1. (Tier-1 extraction needs pypdf) python -m venv .venv-ref");
  ui.out("     .venv-ref\\Scripts\\python.exe -m pip install -r tools/requirements-ref.txt");
  ui.out("  2. Register a file: add {id, path} to references.json (relative");
  ui.out("     paths stay inside the library root; absolute paths are allowed");
  ui.out("     but flagged external). See docs/references.md in the repository.");
  ui.out("  3. Index: python tools/ref_extract.py --manifest <lib>/references.json");
  ui.out("     --lib-root <lib> --out <lib>/.index");
  ui.out("  4. Search: python tools/ref_search.py --lib project=<lib> --query \"...\"");
  ui.out("  5. Verify: npx autocad-skill doctor");
  return 0;
}

module.exports = { run, resolveRoots };
