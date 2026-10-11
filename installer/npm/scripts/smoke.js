"use strict";

/* Isolated package smoke test.
 *
 * Verifies the ACTUAL tarball a user would download from npm — not the
 * repository checkout. Run it after `npm pack`:
 *
 *     node scripts/smoke.js [path/to/autocad-skill-x.y.z.tgz]
 *
 * What it does, in throwaway directories under the OS temp dir:
 *   1. installs the tarball into an empty project with npm (offline: the
 *      package has zero dependencies, so nothing is fetched from the registry).
 *      npm's own extraction is what unpacks it — this is the real consumer
 *      path, and it needs no `tar` binary,
 *   2. checks what npm actually unpacked (entry point shipped, test/ and
 *      scripts/ not shipped),
 *   3. runs the installed binary exactly as `npx autocad-skill` would,
 *   4. checks the installed skill lands in a documented OpenCode discovery
 *      source, with the right id and frontmatter,
 *   5. checks the migration path for an installation left at an old,
 *      undiscovered location,
 *   6. checks the update plan and doctor.
 *
 * It never writes to the repository, to this machine's real home directory,
 * or to any real OpenCode skills folder: every run gets its own
 * AUTOCAD_SKILL_HOME.
 *
 * Exit code 0 = every check passed. No AutoCAD and no OpenCode install is
 * required, and none is claimed.
 */

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PKG = path.resolve(__dirname, "..");

/** Resolve npm as `node npm-cli.js`.
 *
 *  Spawning `npm.cmd` directly fails on Windows unless a shell is used, and a
 *  shell would re-quote our arguments — so call npm's JavaScript entry point
 *  through the current Node binary instead. */
function npmInvocation() {
  const execpath = process.env.npm_execpath;
  if (execpath && /\.js$/i.test(execpath) && fs.existsSync(execpath)) {
    return { cmd: process.execPath, prefix: [execpath] };
  }
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (fs.existsSync(cli)) return { cmd: process.execPath, prefix: [cli] };
  return {
    cmd: process.platform === "win32" ? "npm.cmd" : "npm",
    prefix: [],
    shell: process.platform === "win32",
  };
}

let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks += 1;
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout || 180000,
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...(opts.env || {}) },
    shell: Boolean(opts.shell),
  });
  const spawnError = r.error ? `spawn error: ${r.error.message}` : "";
  return {
    status: r.status,
    ok: r.status === 0 && !r.error,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    output: [spawnError, r.stdout, r.stderr].filter(Boolean).join(""),
  };
}

function cli(bin, args, opts) {
  return run(process.execPath, [bin, ...args], opts);
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  return m ? m[1] : "";
}

/** { "rel/path": sha256 } for every file under `dir`. */
function treeHashes(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) {
        out[r] = crypto.createHash("sha256").update(fs.readFileSync(path.join(d, e.name))).digest("hex");
      }
    }
  };
  walk(dir, "");
  return out;
}

/** Rewrite a skill directory to the identity releases up to 0.2.0 shipped. */
function downgradeToOldIdentity(dir) {
  const md = path.join(dir, "SKILL.md");
  const text = fs.readFileSync(md, "utf8").replace(/^name:\s*engineering-cad\s*$/m, "name: engineering-cad-agent");
  fs.writeFileSync(md, text, "utf8");
  const p = path.join(dir, "skill.json");
  const sj = JSON.parse(fs.readFileSync(p, "utf8"));
  sj.id = "engineering_agent";
  sj.name = "engineering-cad-agent";
  fs.writeFileSync(p, JSON.stringify(sj, null, 2) + "\n", "utf8");
}

/** The install manifest a 0.2.0 install carried for `dir`. */
function writeLegacyManifest(dir) {
  const files = treeHashes(dir);
  delete files[".autocad-skill-manifest.json"];
  const manifest = {
    schema: 1,
    skillId: "engineering_agent",
    skillVersion: "0.1.0",
    installerVersion: "0.2.0",
    installedAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(
    path.join(dir, ".autocad-skill-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
}

function main() {
  const tarball = path.resolve(process.argv[2] || path.join(PKG, "autocad-skill-0.4.0.tgz"));
  if (!fs.existsSync(tarball)) {
    console.error(`smoke: tarball not found: ${tarball}`);
    console.error("smoke: run `npm pack` first, or pass the tarball path.");
    return 2;
  }

  const root = tempDir("acs-smoke-");
  const home1 = path.join(root, "home1");
  const home2 = path.join(root, "home2");
  const app = path.join(root, "app");
  fs.mkdirSync(app, { recursive: true });

  try {
    console.log(`smoke: tarball ${path.basename(tarball)}`);
    console.log(`smoke: sandbox ${root}`);

    // 1. Install from the tarball (offline: zero dependencies) ---------------
    const npm = npmInvocation();
    const inst = run(
      npm.cmd,
      [
        ...npm.prefix,
        "install",
        tarball,
        "--prefix",
        app,
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--no-save",
        "--offline",
      ],
      { cwd: app, shell: npm.shell }
    );
    check(inst.ok, "npm install <tarball> (offline, no registry access)", inst.output.trim().slice(-600));

    // 2. What npm unpacked from the tarball ----------------------------------
    const srcRoot = path.join(app, "node_modules", "autocad-skill");
    check(fs.existsSync(path.join(srcRoot, "bin", "autocad-skill.js")), "package entry point present");
    check(fs.existsSync(path.join(srcRoot, "lib", "migrate.js")), "lib/migrate.js shipped");
    check(fs.existsSync(path.join(srcRoot, "README.md")), "README.md shipped");
    check(fs.existsSync(path.join(srcRoot, "LICENSE")), "LICENSE shipped");
    check(
      fs.existsSync(path.join(srcRoot, "skill", "engineering_agent", "SKILL.md")),
      "skill shipped inside the package"
    );
    check(!fs.existsSync(path.join(srcRoot, "test")), "test/ not shipped");
    check(!fs.existsSync(path.join(srcRoot, "scripts")), "scripts/ not shipped");

    const bin = path.join(srcRoot, "bin", "autocad-skill.js");
    if (!fs.existsSync(bin)) {
      console.log("smoke: installed binary missing — stopping early.");
      return 1;
    }

    const skillJsonSrc = readJson(path.join(srcRoot, "skill", "engineering_agent", "skill.json"));
    const pkgSrc = readJson(path.join(PKG, "package.json"));
    const env1 = { AUTOCAD_SKILL_HOME: home1 };

    // 3. The installed binary behaves like `npx autocad-skill` ---------------
    const help = cli(bin, ["help"], { env: env1 });
    check(help.ok, "help exits 0");
    check(/--local/.test(help.output), "help documents --local");

    const ver = cli(bin, ["version"], { env: env1 });
    const lines = ver.stdout.trim().split(/\r?\n/);
    check(ver.ok && lines[0] === "Engineering CAD Agent", "version prints the package banner");
    check(lines[1] === `Skill version: ${skillJsonSrc.version}`, "version prints the packaged skill version");
    check(lines[2] === `Installer version: ${pkgSrc.version}`, "version prints the installer version");

    const dry = cli(bin, ["install", "--dry-run", "--yes"], { cwd: app, env: env1 });
    check(dry.ok, "install --dry-run exits 0");
    check(!fs.existsSync(home1), "install --dry-run writes nothing", `home1=${fs.existsSync(home1)}`);

    const install = cli(bin, ["install", "--yes"], { cwd: app, env: env1 });
    check(install.ok, "install exits 0", install.output.trim().slice(-500));

    const target = path.join(home1, ".config", "opencode", "skills", "engineering-cad");
    check(fs.existsSync(path.join(target, "SKILL.md")), "skill installed to ~/.config/opencode/skills/engineering-cad");
    check(
      !fs.existsSync(path.join(home1, ".opencode", "skills")),
      "not installed into <home>/.opencode/skills"
    );
    check(install.stdout.includes("@engineering-cad"), "install reports the mention handle");
    check(install.stdout.includes("Skill ID: engineering-cad"), "install reports the skill id");

    const md = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
    const fm = frontmatter(md);
    check(/^name:\s*engineering-cad\s*$/m.test(fm), "frontmatter name is engineering-cad");
    check(!/^slash:\s*true\s*$/m.test(fm), "no fictional slash field in frontmatter");
    check(/^description:/m.test(fm), "frontmatter description present");
    check(!/autoinvoke:\s*false/i.test(fm), "skill is not hidden from the model");

    const sj = readJson(path.join(target, "skill.json"));
    check(sj.id === "engineering-cad", "skill.json id is engineering-cad");
    check(fs.existsSync(path.join(target, ".autocad-skill-manifest.json")), "manifest written");

    const again = cli(bin, ["install"], { cwd: app, env: env1 });
    check(again.ok && /Already installed/i.test(again.output), "re-running install is a no-op");

    const doc = cli(bin, ["doctor"], { cwd: app, env: env1 });
    check(doc.ok, "doctor exits 0", doc.output.trim().slice(-600));
    check(/✓ Skill ID engineering-cad/.test(doc.stdout), "doctor reports the skill id");
    check(/✓ Skill discovery .*documented OpenCode source/.test(doc.stdout), "doctor confirms the discovery source");
    check(/✓ skill permission/.test(doc.stdout), "doctor reports the skill permission");
    check(/Legacy install none/.test(doc.stdout), "doctor reports no legacy install");

    const upd = cli(bin, ["update", "--dry-run", "--yes"], { cwd: app, env: env1 });
    check(upd.ok, "update --dry-run exits 0");
    check(/up to date/i.test(upd.output), "update reports the fresh copy as up to date");

    // 4. Migration of an old, undiscovered install ---------------------------
    // What a real 0.2.0 install looked like: the old identity, the manifest
    // that install wrote for it, plus a file of the user's own.
    const legacy = path.join(home2, ".opencode", "skills", "engineering_agent");
    fs.mkdirSync(legacy, { recursive: true });
    fs.cpSync(path.join(srcRoot, "skill", "engineering_agent"), legacy, { recursive: true });
    downgradeToOldIdentity(legacy);
    writeLegacyManifest(legacy);
    fs.writeFileSync(path.join(legacy, "my-notes.md"), "user files travel with the migration\n");

    const mig = cli(bin, ["install", "--yes"], { cwd: app, env: { AUTOCAD_SKILL_HOME: home2 } });
    check(mig.ok, "install migrates an old home install", mig.output.trim().slice(-600));
    const newTarget = path.join(home2, ".config", "opencode", "skills", "engineering-cad");
    check(fs.existsSync(path.join(newTarget, "SKILL.md")), "migrated into the documented global source");
    check(
      fs.existsSync(path.join(newTarget, "my-notes.md")),
      "user-added file travelled with the migration"
    );
    check(/Migrated and validated/i.test(mig.stdout), "install reports the migration");
    check(!fs.existsSync(legacy), "old copy removed after --yes");
    check(
      fs.existsSync(path.join(home2, ".opencode", "skills")),
      "the skills parent directory is never removed"
    );

    // The whole point: the migrated copy carries the fixed identity.
    const migMd = fs.readFileSync(path.join(newTarget, "SKILL.md"), "utf8");
    check(/^name:\s*engineering-cad\s*$/m.test(frontmatter(migMd)), "migrated frontmatter name refreshed");
    check(!/^slash:\s*true\s*$/m.test(frontmatter(migMd)), "migrated frontmatter has no fictional slash field");
    const migSj = readJson(path.join(newTarget, "skill.json"));
    check(migSj.id === "engineering-cad", "migrated skill.json id refreshed");
    check(/Refreshed 2 file\(s\) from the current package/.test(mig.stdout), "migration reports what it refreshed");

    // 4b. An incomplete legacy install must NOT be migrated or touched -------
    const home3 = path.join(root, "home3");
    const broken = path.join(home3, ".opencode", "skills", "engineering_agent");
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, "SKILL.md"), "---\nname: x\ndescription: y\n---\nnot a skill\n");
    const bad = cli(bin, ["install", "--yes"], { cwd: app, env: { AUTOCAD_SKILL_HOME: home3 } });
    check(!bad.ok, "an invalid legacy install is refused rather than migrated");
    check(
      fs.existsSync(path.join(broken, "SKILL.md")),
      "the invalid old installation is left untouched"
    );
    check(
      !fs.existsSync(path.join(home3, ".config", "opencode", "skills", "engineering-cad")),
      "nothing is written for a refused migration"
    );
    check(/left untouched|left in place/i.test(bad.output), "the refusal explains what happened");

    // 5. Nothing outside the target ------------------------------------------
    const roots1 = fs.existsSync(home1) ? fs.readdirSync(home1).sort() : [];
    check(JSON.stringify(roots1) === JSON.stringify([".config"]), "only .config created in the home", roots1.join(","));

    console.log("");
    console.log(`smoke: ${checks - failures}/${checks} checks passed`);
    console.log(`smoke: ${failures === 0 ? "PASS" : "FAIL"}`);
    console.log("smoke: structural checks only — no AutoCAD, no OpenCode TUI, no live skill execution claimed.");
    return failures === 0 ? 0 : 1;
  } finally {
    try {
      rmrf(root);
    } catch {
      /* sandbox cleanup is best-effort */
    }
  }
}

process.exit(main());
