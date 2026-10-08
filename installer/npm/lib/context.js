"use strict";

/*
 * Shared resolution for every command: where we are, what we found, what we
 * would touch. Read-only — nothing here writes to disk.
 *
 * Exit codes used across commands:
 *   0 success / nothing to do
 *   1 error (invalid environment, failed validation)
 *   2 aborted (user declined, or confirmation needed without a terminal)
 */

const path = require("path");
const { resolveSkillSource, readPackageMeta } = require("./source");
const {
  detectOS, findProjectRoot, findConfigFile, detectOpenCode,
  resolveSkillsTarget, backupRootFor, readInstalled, SKILL_ID,
} = require("./detect");
const { inspectRegistration, inspectMcp } = require("./config");
const { compareTrees, diffAgainstManifest } = require("./manifest");
const { isDir } = require("./fsx");

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_ABORT = 2;

/**
 * Build the shared context.
 * opts: { cwd, project, global, skillId }
 * Throws on unrecoverable problems (no skill source, bad --project path).
 */
function buildContext(opts = {}) {
  const cwd = path.resolve(opts.cwd || process.cwd());

  // --project must point at an existing directory (invalid env => hard error).
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
  const configPath = findConfigFile(project.root);
  const skillId = opts.skillId || SKILL_ID;
  const { skillsRoot, targetDir, mode } = resolveSkillsTarget(project.root, {
    global: opts.global,
    skillId,
  });

  const source = resolveSkillSource();
  const pkg = readPackageMeta();
  const osInfo = detectOS();
  const openCode = detectOpenCode(project.root, configPath);
  const installed = readInstalled(targetDir);

  // A config file that exists but cannot be parsed is captured, not thrown:
  // doctor still runs its other checks, install stops with a clear error.
  let configError = null;
  let registration = null;
  let mcp = { present: false };
  if (configPath) {
    try {
      registration = inspectRegistration(configPath, targetDir);
      mcp = inspectMcp(configPath);
    } catch (e) {
      configError = e;
    }
  }

  return {
    cwd, startDir, skillId, mode,
    projectRoot: project.root,
    projectSignals: project.signals,
    configPath,
    configError,
    skillsRoot, targetDir,
    backupRoot: backupRootFor(project.root, { global: opts.global }),
    source, pkg, osInfo, openCode, installed,
    yes: Boolean(opts.yes),
    dryRun: Boolean(opts.dryRun),
    register: Boolean(opts.register),

    registration,
    mcp,
  };
}

/** Comparison of the installed tree against the available source tree. */
function compareInstalled(ctx) {
  if (!ctx.installed.installed) return null;
  return compareTrees(ctx.targetDir, ctx.source.dir);
}

/** Local modifications relative to what the installer last wrote. */
function localMods(ctx) {
  if (!ctx.installed.installed) return null;
  return diffAgainstManifest(ctx.targetDir);
}

module.exports = { buildContext, compareInstalled, localMods, EXIT_OK, EXIT_ERROR, EXIT_ABORT };
