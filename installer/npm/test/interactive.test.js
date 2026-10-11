"use strict";

/* Interactive-setup unit tests (node:test, no dependencies).
 *
 * TTY prompts are exercised with fake streams — no PTY, no hanging.
 * Non-interactive behavior (flags win, scripts unaffected) is covered by
 * the existing suite running with closed stdin throughout. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");
const { choose, askText } = require("../lib/prompt");
const { writeMcpServer, mcpServerSnippet } = require("../lib/config");
const { detectHosts } = require("../lib/detect");
const { tempDir, rmrf } = require("./helpers");

function ttyInput(text) {
  const stream = new PassThrough();
  stream.isTTY = true;
  const out = new PassThrough();
  out.resume();
  return { stream, out, text };
}

test("choose returns the picked index on a TTY", async () => {
  const { stream, out } = ttyInput();
  const pending = choose("Pick?", ["aa", "bb", "cc"], { stream, out });
  stream.write("2\n");
  assert.strictEqual(await pending, 1);
});

test("choose falls back to default on empty or bad input", async () => {
  for (const keys of ["\n", "9\n", "x\n"]) {
    const { stream, out } = ttyInput();
    const pending = choose("Pick?", ["aa", "bb"], { stream, out, defaultIndex: 1 });
    stream.write(keys);
    assert.strictEqual(await pending, 1, JSON.stringify(keys));
  }
});

test("choose takes the default without prompting when not a TTY", async () => {
  const stream = new PassThrough(); // isTTY falsy: piped, like spawned tests
  const out = new PassThrough();
  out.resume();
  assert.strictEqual(await choose("Pick?", ["aa", "bb"], { stream, out }), 0);
});

test("choose takes the default with --yes without prompting", async () => {
  const { stream, out } = ttyInput();
  assert.strictEqual(await choose("Pick?", ["aa", "bb"], { stream, out, yes: true }), 0);
});

test("askText returns trimmed input, default on empty, default off-TTY", async () => {
  const a = ttyInput();
  const pa = askText("Path?", { stream: a.stream, out: a.out });
  a.stream.write("  C:\\x  \n");
  assert.strictEqual(await pa, "C:\\x");

  const b = ttyInput();
  const pb = askText("Path?", { stream: b.stream, out: b.out, defaultValue: "dflt" });
  b.stream.write("\n");
  assert.strictEqual(await pb, "dflt");

  const plain = new PassThrough();
  const out = new PassThrough();
  out.resume();
  assert.strictEqual(await askText("Path?", { stream: plain, out }), null);
});

test("writeMcpServer creates a minimal config when none exists", (t) => {
  const dir = tempDir("acs-mcp-");
  t.after(() => rmrf(dir));
  const cfg = path.join(dir, "opencode.json");

  const res = writeMcpServer(cfg, { command: "C:\\m\\a.exe", cwd: "C:\\m", outputRoot: "C:\\o" });
  assert.strictEqual(res.changed, true);
  const data = JSON.parse(fs.readFileSync(cfg, "utf8"));
  assert.strictEqual(data.mcp.servers["autocad-mcp"].command[0], "C:\\m\\a.exe");
  assert.strictEqual(data.mcp.servers["autocad-mcp"].environment.ACAD_MCP_OUTPUT_ROOT, "C:\\o");
});

test("writeMcpServer preserves unrelated keys and backs up", (t) => {
  const dir = tempDir("acs-mcp-");
  t.after(() => rmrf(dir));
  const cfg = path.join(dir, "opencode.json");
  fs.writeFileSync(cfg, JSON.stringify({ theme: "dark", mcp: { servers: {} } }), "utf8");

  const res = writeMcpServer(cfg, { command: "C:\\m\\a.exe", cwd: "C:\\m", outputRoot: "C:\\o" });
  assert.strictEqual(res.changed, true);
  assert.ok(res.backupPath && fs.existsSync(res.backupPath));
  const data = JSON.parse(fs.readFileSync(cfg, "utf8"));
  assert.strictEqual(data.theme, "dark");
  assert.strictEqual(data.mcp.servers["autocad-mcp"].cwd, "C:\\m");
});

test("writeMcpServer is a no-op for identical entries, refuses conflicts", (t) => {
  const dir = tempDir("acs-mcp-");
  t.after(() => rmrf(dir));
  const cfg = path.join(dir, "opencode.json");
  const entry = { type: "local", command: ["C:\\m\\a.exe"], cwd: "C:\\m",
                  environment: { ACAD_MCP_OUTPUT_ROOT: "C:\\o" } };
  fs.writeFileSync(cfg, JSON.stringify({ mcp: { servers: { "autocad-mcp": entry } } }), "utf8");

  const same = writeMcpServer(cfg, { command: "C:\\m\\a.exe", cwd: "C:\\m", outputRoot: "C:\\o" });
  assert.strictEqual(same.changed, false);

  assert.throws(
    () => writeMcpServer(cfg, { command: "D:\\other\\b.exe", cwd: "D:\\other", outputRoot: "D:\\o" }),
    /Refusing to overwrite/
  );
  const kept = JSON.parse(fs.readFileSync(cfg, "utf8"));
  assert.strictEqual(kept.mcp.servers["autocad-mcp"].command[0], "C:\\m\\a.exe");
});

test("writeMcpServer dry-run changes nothing", (t) => {
  const dir = tempDir("acs-mcp-");
  t.after(() => rmrf(dir));
  const cfg = path.join(dir, "opencode.json");

  const res = writeMcpServer(cfg, { command: "C:\\m\\a.exe", cwd: "C:\\m", outputRoot: "C:\\o", dryRun: true });
  assert.strictEqual(res.changed, true);
  assert.strictEqual(fs.existsSync(cfg), false);
});

test("mcpServerSnippet is parseable JSON with the server block", () => {
  const data = JSON.parse(mcpServerSnippet("C:\\m\\a.exe", "C:\\m", "C:\\o"));
  assert.strictEqual(data.mcp.servers["autocad-mcp"].command[0], "C:\\m\\a.exe");
});

test("detectHosts reports per-agent signals without touching disk", (t) => {
  const home = tempDir("acs-home-");
  t.after(() => rmrf(home));
  const project = tempDir("acs-proj-");
  t.after(() => rmrf(project));
  fs.mkdirSync(path.join(project, ".claude"), { recursive: true });

  const prev = process.env.AUTOCAD_SKILL_HOME;
  process.env.AUTOCAD_SKILL_HOME = home;
  let hosts;
  try {
    hosts = detectHosts(project);
  } finally {
    if (prev === undefined) delete process.env.AUTOCAD_SKILL_HOME;
    else process.env.AUTOCAD_SKILL_HOME = prev;
  }
  assert.strictEqual(hosts.length, 3);
  const claude = hosts.find((h) => h.agent === "claude");
  assert.strictEqual(claude.detected, true);
  assert.ok(claude.signals.includes(".claude/"));
  const codex = hosts.find((h) => h.agent === "codex");
  assert.strictEqual(codex.detected, false);
});
