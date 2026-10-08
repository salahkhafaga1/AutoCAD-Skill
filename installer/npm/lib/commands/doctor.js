"use strict";

/* `autocad-skill doctor` — read-only environment and installation checks.
 * Exits 1 only when at least one check reports ERROR. */

const ui = require("../ui");
const { buildContext, EXIT_OK, EXIT_ERROR } = require("../context");
const { detectNpm, detectPython, detectAutoCAD } = require("../detect");
const { validateSkillDir } = require("../validate");
const { diffAgainstManifest } = require("../manifest");

const STATUS = { PASS: "PASS", WARN: "WARN", ERROR: "ERROR", MISSING: "NOT DETECTED" };

function run(opts = {}) {
  ui.header("Engineering CAD Agent Skill doctor");

  let ctx = null;
  let ctxError = null;
  try {
    ctx = buildContext(opts);
  } catch (e) {
    ctxError = e;
  }

  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });

  // --- Node ---------------------------------------------------------------
  const major = Number(process.versions.node.split(".")[0]);
  add("Node.js", major >= 18 ? STATUS.PASS : STATUS.ERROR, `v${process.versions.node}`);

  // --- npm ----------------------------------------------------------------
  const npm = detectNpm();
  add("npm", npm.detected ? STATUS.PASS : STATUS.MISSING, npm.detected ? npm.version : undefined);

  if (ctxError) {
    add("Skill source", STATUS.ERROR, ctxError.message);
    return render(checks);
  }

  // --- OpenCode -----------------------------------------------------------
  add(
    "OpenCode",
    ctx.openCode.detected ? STATUS.PASS : STATUS.MISSING,
    ctx.openCode.detected ? ctx.openCode.signals.join(", ") : "no binary, config, or .opencode/ found"
  );

  // --- Skill installation -------------------------------------------------
  if (ctx.installed.installed) {
    add(
      "Engineering CAD Skill",
      STATUS.PASS,
      `v${ctx.installed.version || "unknown"} at ${ctx.targetDir}`
    );
  } else {
    add("Engineering CAD Skill", STATUS.MISSING, `not installed (expected at ${ctx.targetDir})`);
  }

  // --- Skill integrity ----------------------------------------------------
  if (ctx.installed.installed) {
    const v = validateSkillDir(ctx.targetDir);
    const errors = v.checks.filter((c) => !c.ok && c.severity === "error");
    const warns = v.checks.filter((c) => !c.ok && c.severity === "warn");
    if (errors.length) {
      add("Skill integrity", STATUS.ERROR, errors.map((c) => c.name).join(", "));
    } else if (warns.length) {
      add("Skill integrity", STATUS.WARN, warns.map((c) => `${c.name} (${c.detail || "missing"})`).join(", "));
    } else {
      add("Skill integrity", STATUS.PASS, `${v.fileCount} files, structure and hashes verified`);
    }

    // Local modifications
    const mods = diffAgainstManifest(ctx.targetDir);
    if (mods.manifest === null) {
      add("Local modifications", STATUS.WARN, "no installer manifest — cannot verify file hashes");
    } else if (mods.modified.length || mods.added.length || mods.missing.length) {
      const parts = [];
      if (mods.modified.length) parts.push(`${mods.modified.length} modified`);
      if (mods.added.length) parts.push(`${mods.added.length} added`);
      if (mods.missing.length) parts.push(`${mods.missing.length} removed`);
      add("Local modifications", STATUS.WARN, parts.join(", "));
    } else {
      add("Local modifications", STATUS.PASS, "none — files match what the installer wrote");
    }

    // Update availability
    const available = ctx.source.skillJson.version;
    if (ctx.installed.version && ctx.installed.version !== available) {
      add("Update availability", STATUS.WARN, `installed v${ctx.installed.version}, available v${available}`);
    } else {
      add("Update availability", STATUS.PASS, `up to date (v${available})`);
    }
  }

  // --- OpenCode configuration ---------------------------------------------
  if (ctx.configError) {
    add("OpenCode configuration", STATUS.ERROR, ctx.configError.message);
  } else if (!ctx.configPath) {
    add("OpenCode configuration", STATUS.MISSING, "no opencode.json found");
  } else {
    const r = ctx.registration;
    if (r && r.registered) {
      add("OpenCode configuration", STATUS.PASS, `skill listed in skills array (${ctx.configPath})`);
    } else if (r && r.conflict && ctx.installed.installed) {
      add("OpenCode configuration", STATUS.WARN, `skills entry may duplicate this skill: ${r.conflict}`);
    } else if (r && r.conflict) {
      add("OpenCode configuration", STATUS.PASS, `skill provided by skills entry: ${r.conflict}`);
    } else {
      add(
        "OpenCode configuration",
        STATUS.PASS,
        `auto-discovery location (${ctx.configPath}, no skills entry needed)`
      );
    }
  }

  // --- autocad-mcp ---------------------------------------------------------
  const mcp = ctx.mcp;
  if (mcp.parseError) {
    add("autocad-mcp", STATUS.ERROR, `config unreadable: ${mcp.parseError}`);
  } else if (!mcp.present) {
    add("autocad-mcp", STATUS.MISSING, "not configured in opencode.json");
  } else if (!mcp.command) {
    add("autocad-mcp", STATUS.WARN, "configured but no command entry");
  } else {
    add("autocad-mcp", STATUS.PASS, `configured (command: ${mcp.command})`);
  }

  // --- Python ---------------------------------------------------------------
  const py = detectPython();
  add("Python", py.detected ? STATUS.PASS : STATUS.MISSING, py.detected ? `Python ${py.version}` : undefined);

  // --- AutoCAD ---------------------------------------------------------------
  const acad = detectAutoCAD();
  if (acad.detected) add("AutoCAD", STATUS.PASS, acad.path);
  else add("AutoCAD", ctx.osInfo.isWindows ? STATUS.WARN : STATUS.MISSING, "not detected");

  return render(checks);
}

function render(checks) {
  ui.blank();
  for (const c of checks) {
    switch (c.status) {
      case STATUS.PASS: ui.ok(`${c.name}${c.detail ? ` ${c.detail}` : ""}`.trim()); break;
      case STATUS.WARN: ui.warn(`${c.name}${c.detail ? ` ${c.detail}` : ""}`.trim()); break;
      case STATUS.ERROR: ui.fail(`${c.name}${c.detail ? ` ${c.detail}` : ""}`.trim()); break;
      default: ui.info(`${c.name}${c.detail ? ` ${c.detail}` : ""}`.trim()); break;
    }
  }

  const count = (s) => checks.filter((c) => c.status === s).length;
  const p = count(STATUS.PASS);
  const w = count(STATUS.WARN);
  const e = count(STATUS.ERROR);
  const m = count(STATUS.MISSING);

  ui.blank();
  ui.out(`Summary: ${p} passed, ${w} warning(s), ${e} error(s), ${m} not detected`);
  if (e > 0) ui.out("Result: ERRORS found — see above.");
  else ui.out("Result: no errors.");

  return e > 0 ? EXIT_ERROR : EXIT_OK;
}

module.exports = { run, STATUS };
