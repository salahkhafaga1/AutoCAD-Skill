#!/usr/bin/env node
"use strict";

/*
 * autocad-skill — CLI entry point.
 *
 * Commands: install (default) | update | doctor | refs | version | help
 *
 * Global flags:
 *   --project <dir>   project to operate on (implies --local)
 *   --local           install into <project>/.opencode/skills instead of the
 *                     OpenCode global skills source
 *   --global          the global skills source (default)
 *   --agent <name>    target agent host: opencode (default), claude, codex
 *   --yes, -y         skip confirmation prompts (scripts / CI)
 *   --dry-run         show what would change, then exit without changing it
 *   --register        install only: also append the skill path to the
 *                     opencode.json skills array (confirmed, backed up)
 *   --rollback        update only: restore the most recent backup
 *   init              refs only: scaffold an empty reference library
 *                     (`refs init` or `refs --init`)
 *
 * Exit codes: 0 success · 1 error · 2 aborted (declined / needs a terminal)
 */

const ui = require("../lib/ui");

const COMMANDS = {
  install: () => require("../lib/commands/install"),
  update: () => require("../lib/commands/update"),
  doctor: () => require("../lib/commands/doctor"),
  refs: () => require("../lib/commands/refs"),
  version: () => require("../lib/commands/version"),
};

function usage() {
  return [
    "autocad-skill — installer for the Engineering CAD Agent Skill",
    "",
    "Usage: npx autocad-skill [command] [options]",
    "",
    "Commands:",
    "  install     Copy the skill into OpenCode's skills folder (default)",
    "  update      Compare, show changes, back up, then apply after confirmation",
    "  update --rollback  Restore the most recent backup",
    "  doctor      Read-only environment and installation checks",
    "  refs        Reference-library status, or `refs init` to scaffold one",
    "  version     Print skill, installer, and tool-contract versions",
    "  help        Show this message",
    "",
    "Options:",
    "  --global         OpenCode's global skills folder (default)",
    "  --local          Install into the project's .opencode/skills instead",
    "  --project <dir>  Project to operate on (implies --local)",
    "  --agent <name>    Target agent host: opencode (default), claude, codex",
    "  --yes, -y        Skip confirmation prompts (scripts / CI)",
    "  --dry-run        Show what would change; change nothing",
    "  --register       Also add the skill path to the opencode.json skills array",
    "  --rollback       (update) Restore the most recent backup",
    "",
    "The skill is installed as engineering-cad; mention @engineering-cad in a prompt",
    "or ask a CAD task and let the model load it. (A / command needs a separate",
    "commands/ file; skills never appear in the / menu on their own.)",
    "",
    "Exit codes: 0 success · 1 error · 2 aborted (declined or needs a terminal)",
    "Docs: installer/npm/README.md and docs/installation.md",
  ].join("\n");
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--yes" || a === "-y") opts.yes = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--register") opts.register = true;
    else if (a === "--rollback") opts.rollback = true;
    else if (a === "--global") opts.global = true;
    else if (a === "--local") opts.local = true;
    else if (a === "--agent") {
      const v = argv[++i];
      if (v === undefined) throw Object.assign(new Error("--agent requires a name"), { code: "EBADFLAG" });
      opts.agent = v;
    } else if (a.startsWith("--agent=")) {
      opts.agent = a.slice("--agent=".length);
    } else if (a === "--project") {
      const v = argv[++i];
      if (v === undefined) throw Object.assign(new Error("--project requires a directory"), { code: "EBADFLAG" });
      opts.project = v;
    } else if (a.startsWith("--project=")) {
      opts.project = a.slice("--project=".length);
    } else if (a.startsWith("-")) {
      throw Object.assign(new Error(`Unknown option: ${a}`), { code: "EBADFLAG" });
    } else {
      opts._.push(a);
    }
  }
  return opts;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    ui.err(e.message);
    process.stderr.write(usage() + "\n");
    return 1;
  }

  const command = opts._[0];

  if (opts.help || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage() + "\n");
    return 0;
  }

  if (!command) {
    // No command given: install is the default (npx autocad-skill).
    opts.command = "install";
  } else if (Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    opts.command = command;
  } else {
    ui.err(`Unknown command: ${command}`);
    process.stderr.write(usage() + "\n");
    return 1;
  }

  const mod = COMMANDS[opts.command]();
  try {
    return await mod.run(opts);
  } catch (e) {
    ui.err(e.message || String(e));
    if (process.env.AUTOCAD_SKILL_DEBUG) process.stderr.write(String(e.stack || "") + "\n");
    return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    ui.err(e && e.message ? e.message : String(e));
    process.exit(1);
  }
);
