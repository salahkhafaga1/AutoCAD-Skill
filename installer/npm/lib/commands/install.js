"use strict";

/* `autocad-skill install` — copy the skill into the selected agent's skills folder. */


const path = require("path");
const ui = require("../ui");
const { buildContext, EXIT_OK, EXIT_ERROR, EXIT_ABORT } = require("../context");
const { walkFiles, copyFiles, exists } = require("../fsx");
const { writeManifest, diffAgainstManifest } = require("../manifest");
const { validateSkillDir } = require("../validate");
const { needConfirm, choose, askText } = require("../prompt");
const { registerSkillPath, mcpServerSnippet, writeMcpServer } = require("../config");
const { migrate } = require("../migrate");
const { readInstalled, detectHosts, homeDir, globalConfigDir } = require("../detect");
const { AGENTS, isOpenCodeAgent } = require("../agents");

/**
 * Interactive install routing: which agent host, which scope.
 * Only ever called on an interactive terminal without --yes. Returns
 * flag-shaped overrides ({ agent } and/or { global } / { local }).
 * Explicit flags always win — this function only fills the gaps.
 */
async function resolveInstallPlan(opts = {}) {
  const plan = {};
  if (!opts.agent) {
    const cwd = path.resolve(opts.cwd || process.cwd());
    const startDir = opts.project ? path.resolve(cwd, opts.project) : cwd;
    const hosts = detectHosts(startDir);
    const ordered = [...hosts.filter((h) => h.detected), ...hosts.filter((h) => !h.detected)];
    const labels = ordered.map((h) =>
      `${AGENTS[h.agent].label}${h.detected && h.signals.length ? ` (detected: ${h.signals.join(", ")})` : ""}`
    );
    const picked = await choose("Which agent will use this skill?", labels, { defaultIndex: 0 });
    plan.agent = ordered[picked].agent;
  }
  if (!opts.global && !opts.local && !opts.project) {
    const picked = await choose("Install scope?", ["Global — every project on this machine", "Project — this project only"], { defaultIndex: 0 });
    if (picked === 0) plan.global = true;
    else plan.local = true;
  }
  return plan;
}

/**
 * Post-install offer: wire the autocad-mcp server into the OpenCode config
 * matching the install scope. TTY-only, OpenCode-only, skipped under --yes
 * and --dry-run. Never overwrites a differing entry (prints the manual
 * snippet instead) and backs up before writing.
 */
async function offerMcpWiring(ctx) {
  const q = await needConfirm(
    `Wire the autocad-mcp server into ${ctx.global ? "global" : "project"} OpenCode config now?`,
    { yes: ctx.yes }
  );
  if (!q.proceed) {
    ui.out("Skipped — wire it later by hand (see installer README, Troubleshooting).");
    return;
  }
  const checkout = await askText("Path to your autocad-mcp checkout (empty to skip):");
  if (!checkout) {
    ui.out("Skipped — nothing was written.");
    return;
  }
  const exe = process.platform === "win32"
    ? path.join(checkout, ".venv", "Scripts", "autocad-mcp.exe")
    : path.join(checkout, ".venv", "bin", "autocad-mcp");
  if (!exists(exe)) {
    ui.fail(`No server entry point at ${exe} — set up the autocad-mcp venv first, then re-run.`);
    ui.out("Manual snippet (fill in your paths):");
    ui.out(mcpServerSnippet("<path-to-autocad-mcp.exe>", "<path-to-autocad-mcp-checkout>", "<output-dir>"));
    return;
  }
  const outputRoot = path.join(homeDir(), "Documents", "autocad-mcp");
  const configPath = ctx.global
    ? path.join(globalConfigDir(), "opencode.json")
    : ctx.configPath;
  if (!configPath) {
    ui.warn("No project opencode.json found — nothing was written. Add this block by hand:");
    ui.out(mcpServerSnippet(exe, checkout, outputRoot));
    return;
  }
  try {
    const res = writeMcpServer(configPath, { command: exe, cwd: checkout, outputRoot });
    if (!res.changed) {
      ui.ok("Server already wired with the same command — nothing to do.");
    } else {
      ui.ok(`Wired autocad-mcp into ${configPath}${res.backupPath ? ` (backup: ${res.backupPath})` : ""}.`);
      ui.out("Restart the OpenCode session so the server starts, then open AutoCAD with a drawing.");
    }
  } catch (e) {
    if (e && e.code === "ECONFIGCONFLICT") {
      ui.warn(`${e.message} Left untouched — merge by hand:`);
      ui.out(mcpServerSnippet(exe, checkout, outputRoot));
      return;
    }
    throw e;
  }
}

async function run(opts = {}) {
  ui.header("Engineering CAD Agent Skill");

  // Interactive setup (TTY only): pick the agent host and the scope when
  // flags did not say. Flags, --yes, and non-interactive runs keep the
  // long-standing defaults (OpenCode, global) byte-for-byte.
  if (process.stdin.isTTY && !opts.yes) {
    const planned = await resolveInstallPlan(opts);
    opts = { ...opts, ...planned };
  }
  const ctx = buildContext(opts);

  // An unreadable opencode.json stops us — but only for OpenCode, the one
  // agent whose configuration we read. Other agents never consult it.
  if (ctx.configError && isOpenCodeAgent(ctx.agent)) {
    ui.fail(`OpenCode configuration cannot be read: ${ctx.configError.message}`);
    return EXIT_ERROR;
  }

  // 1. OS
  ui.ok(`OS detected: ${ctx.osInfo.name}`);

  // 2. Host agent
  if (isOpenCodeAgent(ctx.agent)) {
    if (ctx.openCode.detected) {
      ui.ok(`OpenCode detected (${ctx.openCode.signals.join(", ")})`);
    } else {
      ui.warn("OpenCode not detected — the skill will still be copied to the standard location");
    }
  } else {
    ui.ok(`Target agent: ${ctx.agentLabel} (invoke with ${ctx.agentInvoke})`);
  }

  // 3. Target skill directory + identity
  ui.ok(`Skill directory: ${ctx.targetDir} (${ctx.mode})`);
  if (isOpenCodeAgent(ctx.agent)) {
    ui.ok(`Skill ID: ${ctx.skillId} (mention @${ctx.skillId} in a prompt, or ask a CAD task)`);
  } else {
    ui.ok(`Skill ID: ${ctx.skillId} (${ctx.agentLabel} invocation: ${ctx.agentInvoke})`);
  }

  // 4. --register is an OpenCode-only action (it edits opencode.json).
  if (ctx.register && !isOpenCodeAgent(ctx.agent)) {
    ui.warn("--register only applies to OpenCode; skipped for this agent.");
  } else if (ctx.register) {
    const rc = await handleRegister(ctx);
    if (rc !== EXIT_OK) return rc;
  }

  // 5. An installation left at an old location by a previous version is
  //    migrated first; it never overwrites an existing installation at the
  //    new location.
  if (!ctx.installed.installed && ctx.legacyDirs.length) {
    const m = await migrate(ctx);
    if (m.status === "failed") return EXIT_ERROR;
    if (m.status === "dry-run") {
      ui.blank();
      ui.out("Dry run — no changes made.");
      return EXIT_OK;
    }
    if (m.status === "migrated") return finishMigration(ctx);
  }

  // 6. Already installed -> report only, never touch files.
  if (ctx.installed.installed) return reportAlreadyInstalled(ctx);

  const files = walkFiles(ctx.source.dir);
  const srcVersion = ctx.source.skillJson.version;

  // 7. Plan
  ui.step(`Installing ${ctx.skillId} (${files.length} files, version ${srcVersion})`);

  // 8. Another source root may already provide this skill id: confirm before
  //    creating a second copy of it. (OpenCode registration conflicts only;
  //    other agents have no shared registry to consult.)
  const duplicate = isOpenCodeAgent(ctx.agent) && ctx.registration && ctx.registration.conflict && !ctx.registration.registered;
  if (duplicate) {
    const rc = await confirmDuplicate(ctx);
    if (rc !== EXIT_OK) return rc;
  }
  if (!ctx.register) reportConfigStatus(ctx);

  // 9. Dry run stops here.
  if (ctx.dryRun) {
    ui.blank();
    ui.info(`Would install ${files.length} files into ${ctx.targetDir}`);
    ui.out("Dry run — no changes made.");
    return EXIT_OK;
  }

  // 10. Copy + manifest.
  const copied = copyFiles(ctx.source.dir, ctx.targetDir, files);
  writeManifest(ctx.targetDir, {
    skillId: ctx.skillId,
    skillVersion: srcVersion,
    installerVersion: ctx.pkg.version,
    sourceDir: ctx.source.dir,
  });
  ui.ok(`Skill files written to ${ctx.targetDir} (${copied} files)`);
  ui.ok(`Version ${srcVersion}`);

  // 11. Validate.
  const v = validateSkillDir(ctx.targetDir);
  if (!v.ok) {
    ui.blank();
    ui.fail("Installation validation failed:");
    for (const c of v.checks.filter((x) => !x.ok && x.severity === "error")) {
      ui.bullet(`${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    return EXIT_ERROR;
  }
  ui.ok(`Installation validated (${v.fileCount} files)`);

  // Interactive follow-through (TTY only, OpenCode only): offer MCP wiring.
  // Scripts, flags, and non-interactive runs never see a prompt.
  if (process.stdin.isTTY && !ctx.yes && !ctx.dryRun && isOpenCodeAgent(ctx.agent)) {
    await offerMcpWiring(ctx);
  }

  ui.blank();
  ui.out("Installation complete.");
  nextSteps(ctx);
  return EXIT_OK;
}

/** Shared tail: how the user actually reaches the skill. */
function nextSteps(ctx) {
  ui.blank();
  ui.out("Next steps:");
  ui.blank();
  if (isOpenCodeAgent(ctx.agent)) {
    ui.out("1. Restart or reload OpenCode");
    ui.out(`2. Mention @${ctx.skillId} in a prompt to confirm it loads`);
  } else {
    ui.out(`1. Open ${ctx.agentLabel}`);
    ui.out(`2. Invoke ${ctx.agentInvoke} to confirm the skill is listed`);
  }
  ui.out("3. Start AutoCAD with a drawing open");
  ui.out("4. Ask:");
  ui.out('   "Create a 6000 × 4000 mm room."');
}

/** Migration finished successfully: report, then point at `update`. */
function finishMigration(ctx) {
  const installed = readInstalled(ctx.targetDir);
  const available = ctx.source.skillJson.version;

  ui.blank();
  ui.out("Installation complete (migrated from an old location).");
  if (installed.version && installed.version !== available) {
    ui.blank();
    ui.out(`Migrated version: v${installed.version}  (available: v${available})`);
    ui.out("Run `npx autocad-skill update` to upgrade to the available version.");
  }
  nextSteps(ctx);
  return EXIT_OK;
}

/** Another skills entry already provides this skill id: warn, then confirm. */
async function confirmDuplicate(ctx) {
  ui.warn(`A skills entry already provides this skill id: ${ctx.registration.conflict}`);
  if (ctx.dryRun) {
    ui.out(`Installing a second copy at ${ctx.targetDir} would create a duplicate skill id.`);
    return EXIT_OK;
  }
  ui.out(`Installing a second copy at ${ctx.targetDir} would create a duplicate skill id.`);
  const q = await needConfirm("Install a second copy anyway?", { yes: ctx.yes });
  if (!q.proceed) {
    ui.blank();
    ui.out(q.hint || "Declined. No changes were made.");
    return EXIT_ABORT;
  }
  return EXIT_OK;
}

/** Already-installed path: report only, never touch files. */
function reportAlreadyInstalled(ctx) {
  const installedVersion = ctx.installed.version;
  const availableVersion = ctx.source.skillJson.version;
  const mods = diffAgainstManifest(ctx.targetDir);

  ui.blank();
  if (installedVersion && installedVersion !== availableVersion) {
    ui.out(`Already installed: v${installedVersion} (available: v${availableVersion}).`);
    ui.out("Run `npx autocad-skill update` to upgrade. No changes were made.");
    return EXIT_OK;
  }

  ui.out(`Already installed: v${installedVersion || "unknown"} — no changes made.`);

  if (mods.manifest === null) {
    ui.warn("No installer manifest found (skill may have been copied by hand); cannot verify file hashes.");
    return EXIT_OK;
  }
  const touched = [...mods.modified, ...mods.added, ...mods.missing];
  if (touched.length === 0) {
    ui.ok(`Installation verified (${Object.keys(mods.manifest.files).length} files match)`);
  } else {
    ui.warn(`${touched.length} locally modified/added/removed file(s) — left untouched:`);
    ui.bulletList(touched.sort());
    ui.out("Run `npx autocad-skill update` to review them against the available version.");
  }
  return EXIT_OK;
}

/** Read-only configuration report for the default (auto-discovery) path.
 * OpenCode only: other agents discover by directory alone and keep no
 * central skills registry to report on. */
function reportConfigStatus(ctx) {
  if (!isOpenCodeAgent(ctx.agent)) {
    ui.info(`Discovery: ${ctx.agentLabel} loads skills from ${ctx.skillsRoot}`);
    return;
  }
  const root = ctx.skillsRoot;
  if (!ctx.configPath) {
    ui.info(`Configuration: no opencode.json found — auto-discovery location ${root}`);
    return;
  }
  if (ctx.registration && ctx.registration.registered) {
    ui.ok("Configuration verified (skill already listed in the skills array)");
    return;
  }
  ui.ok(`Configuration verified (no changes required — auto-discovery location ${root})`);
}

/** --register: confirm, then append our path to the skills array. */
async function handleRegister(ctx) {
  if (!ctx.configPath) {
    ui.fail("--register requires an existing opencode.json (none found).");
    return EXIT_ERROR;
  }
  const r = ctx.registration;
  if (r && r.registered) {
    ui.ok("Configuration already lists this skill — no change needed.");
    return EXIT_OK;
  }

  if (ctx.dryRun) {
    ui.info(`Would add ${ctx.targetDir} to the skills array in ${path.basename(ctx.configPath)}`);
    return EXIT_OK;
  }

  const q = await needConfirm(
    `Add ${ctx.targetDir} to the skills array in ${path.basename(ctx.configPath)}?`,
    { yes: ctx.yes }
  );
  if (!q.proceed) {
    ui.blank();
    ui.out(q.hint || "Declined. No changes were made.");
    return EXIT_ABORT;
  }

  try {
    const res = registerSkillPath(ctx.configPath, ctx.targetDir);
    if (res.changed) ui.ok(`Configuration updated: skills entry added (backup: ${res.backupPath})`);
    else ui.ok("Configuration already up to date.");
    return EXIT_OK;
  } catch (e) {
    ui.fail(`Configuration update failed: ${e.message}`);
    return EXIT_ERROR;
  }
}

module.exports = { run };
