"use strict";

/*
 * Confirmation prompts.
 *
 * Policy (from the behavior spec):
 *   - Destructive / behavior-changing actions require confirmation.
 *   - The default is always [y/N] -- pressing Enter declines.
 *   - --yes skips the prompt (for scripts / CI).
 *   - Non-interactive runs without --yes abort with exit code 2 and a hint.
 */

const readline = require("readline");

/**
 * Ask a yes/no question.
 * Returns true only for an explicit "y"/"yes". Everything else (including
 * EOF or an unanswered non-TTY stream) returns false.
 */
function confirm(question, { yes = false, stream = process.stdin, out = process.stdout } = {}) {
  if (yes) return Promise.resolve(true);

  const interactive = Boolean(stream.isTTY);
  if (!interactive) {
    return Promise.resolve(false);
  }

  const rl = readline.createInterface({ input: stream, output: out });
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value);
    };
    rl.question(`${question} [y/N] `, (answer) => {
      const a = String(answer || "").trim().toLowerCase();
      done(a === "y" || a === "yes");
    });
    rl.on("close", () => done(false));
  });
}

/**
 * Gate for actions that need confirmation. Returns { proceed, aborted }.
 * In a non-TTY session without --yes, the action is aborted (exit code 2)
 * with a hint instead of hanging forever.
 */
async function needConfirm(question, opts = {}) {
  const yes = Boolean(opts.yes);
  const interactive = Boolean((opts.stream || process.stdin).isTTY);
  if (!yes && !interactive) {
    return {
      proceed: false,
      aborted: true,
      hint: "Confirmation required but no interactive terminal is available. Re-run with --yes.",
    };
  }
  const proceed = await confirm(question, { ...opts, yes });
  return { proceed, aborted: !proceed, hint: proceed ? null : "Declined. No changes were made." };
}

module.exports = { confirm, needConfirm };
