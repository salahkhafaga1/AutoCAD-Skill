"use strict";

/* Output helpers: honest status lines only — every symbol maps to a real check. */

const SYM = {
  ok: "✓",      // ✓ passed check
  warn: "⚠",    // ⚠ warning
  fail: "✖",    // ✖ error
  info: "○",    // ○ not detected / informational
  step: "›",    // › action in progress
};

function out(text = "") {
  process.stdout.write(text + "\n");
}

function header(title) {
  out(title);
  out("");
}

function line(symbol, text) {
  out(`${symbol} ${text}`);
}

function ok(text) { line(SYM.ok, text); }
function warn(text) { line(SYM.warn, text); }
function fail(text) { line(SYM.fail, text); }
function info(text) { line(SYM.info, text); }
function step(text) { line(SYM.step, text); }

/** Fatal CLI-level error (usage, unhandled exception) -> stderr. */
function err(text) {
  process.stderr.write(`${SYM.fail} ${text}\n`);
}

function blank() { out(""); }

function bullet(text) { out(`  ${text}`); }

function bulletList(items, max = 12) {
  const shown = items.slice(0, max);
  for (const it of shown) bullet(it);
  if (items.length > shown.length) bullet(`… and ${items.length - shown.length} more`);
}

module.exports = { SYM, out, header, line, ok, warn, fail, info, step, err, blank, bullet, bulletList };
