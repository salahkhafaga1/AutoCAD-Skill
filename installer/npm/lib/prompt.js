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

/**
 * Single-choice question ("which agent?", "which scope?").
 * Returns the chosen index. Unlike needConfirm, a non-interactive session
 * (or --yes) silently takes `defaultIndex` instead of aborting — choice
 * questions only steer fresh-install routing, so falling back to the
 * long-standing defaults preserves scripted behavior exactly.
 */
async function choose(question, options, { yes = false, defaultIndex = 0, stream, out } = {}) {
  const input = stream || process.stdin;
  const output = out || process.stdout;
  if (yes || !input.isTTY) return defaultIndex;
  const readline = require("readline");
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value);
    };
    output.write(`${question}\n`);
    options.forEach((label, i) => output.write(`  ${i + 1}. ${label}${i === defaultIndex ? " (default)" : ""}\n`));
    rl.question(`Choose [1-${options.length}, default ${defaultIndex + 1}]: `, (answer) => {
      const n = Number.parseInt(String(answer || "").trim(), 10);
      done(Number.isInteger(n) && n >= 1 && n <= options.length ? n - 1 : defaultIndex);
    });
    rl.on("close", () => done(defaultIndex));
  });
}

/**
 * Free-text question (paths, names). Returns the trimmed answer, the
 * default when the answer is empty, or null when there is no interactive
 * terminal (never hangs, never guesses beyond the default).
 */
async function askText(question, { defaultValue = null, stream, out } = {}) {
  const input = stream || process.stdin;
  const output = out || process.stdout;
  if (!input.isTTY) return defaultValue;
  const readline = require("readline");
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      rl.close();
      const text = String(value || "").trim();
      resolve(text === "" ? defaultValue : text);
    };
    rl.question(`${question} `, done);
    rl.on("close", () => done(defaultValue));
  });
}

module.exports = { confirm, needConfirm, choose, askText };
