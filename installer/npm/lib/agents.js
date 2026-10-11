"use strict";

/* Agent host registry (multi-agent installs).
 *
 * The skill directory itself follows the Agent Skills open standard
 * (SKILL.md with name/description), so any host that discovers
 * "<root>/<id>/SKILL.md" can load it. What differs per host is WHERE
 * those roots live. This module is the single table of install roots;
 * every command resolves targets through it, and tests hermeticity
 * comes free because all home-derived paths flow through homeDir().
 *
 * Opencode-only concepts (opencode.json registration, skill permission
 * rules, slash-command advertisement) stay in opencode-specific code
 * paths guarded by isOpenCodeAgent(). Nothing here changes default
 * behavior: agent "opencode" resolves exactly as before.
 */

const path = require("path");
const { homeDir, globalSkillsRoot } = require("./detect");

const AGENTS = {
  opencode: {
    label: "OpenCode",
    invoke: (id) => `/${id}`,
    globalSkills: () => globalSkillsRoot(),
    projectSkills: (root) => path.join(root, ".opencode", "skills"),
    // OpenCode-specific discovery proof (compat sources included).
    discoveryRoots: null, // handled by isDocumentedTarget in detect.js
  },
  claude: {
    label: "Claude Code",
    invoke: (id) => `/${id}`,
    globalSkills: () => path.join(homeDir(), ".claude", "skills"),
    projectSkills: (root) => path.join(root, ".claude", "skills"),
    discoveryRoots: null, // computed below from the same functions
  },
  codex: {
    label: "Codex",
    invoke: (id) => `$${id}`,
    globalSkills: () => path.join(homeDir(), ".agents", "skills"),
    projectSkills: (root) => path.join(root, ".agents", "skills"),
    discoveryRoots: null,
  },
};

function agentNames() {
  return Object.keys(AGENTS);
}

function isOpenCodeAgent(agent) {
  return (agent || "opencode") === "opencode";
}

/** Throw a usage error for unknown --agent values. */
function requireAgent(agent) {
  const name = agent || "opencode";
  if (!Object.prototype.hasOwnProperty.call(AGENTS, name)) {
    const err = new Error(
      `Unknown agent: ${name} (expected one of: ${agentNames().join(", ")})`
    );
    err.code = "EBADFLAG";
    throw err;
  }
  return name;
}

/** Skills roots for an agent: { global, project } (absolute paths). */
function agentRoots(agent, projectRoot) {
  const spec = AGENTS[requireAgent(agent)];
  return {
    global: spec.globalSkills(),
    project: spec.projectSkills(path.resolve(projectRoot)),
  };
}

/** True when dir is directly inside one of the agent's skill roots. */
function isAgentTarget(agent, dir, projectRoot) {
  const roots = agentRoots(agent, projectRoot);
  const parent = path.dirname(path.resolve(dir));
  return [roots.global, roots.project].some((r) => path.resolve(r) === parent);
}

module.exports = { AGENTS, agentNames, isOpenCodeAgent, requireAgent, agentRoots, isAgentTarget };
