#!/usr/bin/env node
"use strict";

/*
 * autocad-skill — CLI entry point (STRUCTURE ONLY, v0.1.0).
 *
 * This binary intentionally performs NO file-system or configuration
 * changes. Every command below is PLANNED: it parses the invocation,
 * reports the planned behavior, and exits non-zero so no wrapper can
 * mistake it for completed work.
 *
 * Specified future behavior lives in installer/npm/README.md:
 *   install / update / doctor / version — with version detection,
 *   local-modification protection, change display, and explicit
 *   confirmation before anything that can change agent behavior.
 */

const COMMANDS = {
  install:
    "PLANNED — will install the skill into an OpenCode project (safe config merge, explicit confirmation).",
  update:
    "PLANNED — will detect installed version, compare, show changes, detect local modifications, and require confirmation before applying.",
  doctor:
    "PLANNED — will check skill integrity, OpenCode wiring, and autocad-mcp availability.",
  version:
    "PLANNED — will read the installed skill.json manifest and report the skill version.",
};

function usage() {
  console.log([
    "autocad-skill — installer for the Engineering CAD Agent Skill",
    "",
    "Usage: npx autocad-skill <command>",
    "",
    "Commands:",
    ...Object.keys(COMMANDS).map((c) => `  ${c.padEnd(10)} ${COMMANDS[c]}`),
    "",
    "Status: interface and structure only in this version.",
    "Documentation: installer/npm/README.md and docs/installation.md",
  ].join("\n"));
}

function main(argv) {
  const command = argv[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return 0;
  }

  if (Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    console.log(`autocad-skill ${command}: not implemented yet.`);
    console.log(COMMANDS[command]);
    console.log("This release ships structure only; see installer/npm/README.md.");
    return 1;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  return 1;
}

process.exit(main(process.argv.slice(2)));
