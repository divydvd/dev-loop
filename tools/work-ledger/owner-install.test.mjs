import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const source = fileURLToPath(new URL(".", import.meta.url));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = file => hash(fs.readFileSync(file));

async function fixture(t) {
  const api = await import("./owner-install.mjs");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-owner-")));
  t.after(() => {
    function writableDirectories(directory) {
      fs.chmodSync(directory, fs.statSync(directory).mode | 0o700);
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) writableDirectories(path.join(directory, entry.name));
      }
    }
    writableDirectories(root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const candidate = path.join(root, "candidate");
  const installed = path.join(root, "home", "extensions", "work-ledger");
  fs.cpSync(source, candidate, { recursive: true });
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.mkdirSync(installed);
  const manifest = fs.readFileSync(path.join(source, "SOURCE.sha256"), "utf8");
  for (const line of manifest.trim().split("\n")) {
    const file = line.slice(66);
    fs.mkdirSync(path.dirname(path.join(installed, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(installed, file));
  }
  const dataDir = path.join(root, "ledger");
  const originalConfig = `{ "reviewCap": 7, "custom": {"keep": true}, "dataDir": ${JSON.stringify(dataDir)} }\n`;
  fs.writeFileSync(path.join(installed, "config.json"), originalConfig, { mode: 0o600 });
  fs.mkdirSync(path.join(installed, "owner-notes"), { mode: 0o700 });
  fs.writeFileSync(path.join(installed, "owner-notes", "keep.txt"), "preserve all files\n", { mode: 0o600 });
  const request = {
    candidate, installed, backupParent: path.join(root, "private-backups"),
    sourceHash: fileHash(path.join(candidate, "SOURCE.sha256")),
    installedHash: api.installationSnapshot(installed).hash,
    ledgerConfigHash: "absent",
  };
  const options = { execute: true, hostsStopped: true, confirmation: `install ${hash(JSON.stringify(request))}` };
  const run = (extra = {}) => api.prepareInstallation(request, {
    ...options, confirmation: `install ${hash(JSON.stringify(request))}`, ...extra,
  });
  return { ...api, root, candidate, installed, dataDir, originalConfig, request, run };
}

async function descriptor(f) {
  const cwd = path.join(f.root, "project");
  fs.mkdirSync(cwd);
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("remote", "add", "origin", "https://github.com/example/project.git");
  fs.writeFileSync(path.join(cwd, "gradlew"), "#!/bin/sh\nexit 1\n");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
  const destination = path.join(cwd, "build", "local");
  const scope = {
    repo: "example/project", label: "local test", cwd, sha: git("rev-parse", "HEAD"),
    launcher: path.join(cwd, "gradlew"), destination,
    command: `./gradlew :core:publishMavenPublicationToKitTestRepository -PkitRepository=${destination}`,
  };
  const scopesFile = path.join(f.root, "scopes.json");
  fs.writeFileSync(scopesFile, JSON.stringify({ localMavenScopes: [scope] }));
  Object.assign(f.request, { scopesFile, scopesHash: fileHash(scopesFile), ledgerConfigHash: "absent" });
  return scope;
}

test("preview preserves all installed bytes and creates no persistent backup", async t => {
  const f = await fixture(t);
  const before = f.installationSnapshot(f.installed);
  const result = await f.prepareInstallation(f.request);
  assert.equal(result.installed, false);
  assert.deepEqual(f.installationSnapshot(f.installed), before);
  assert.equal(fs.existsSync(f.request.backupParent), false);
});

test("installation needs exact confirmation and stopped-host attestation", async t => {
  const f = await fixture(t);
  await assert.rejects(f.run({ confirmation: "yes" }), /confirmation/i);
  await assert.rejects(f.run({ hostsStopped: false }), /stopped/i);
  assert.equal(fs.existsSync(f.request.backupParent), false);
});

test("install and rollback preserve the whole tree and exact configuration bytes", async t => {
  const f = await fixture(t);
  const before = f.installationSnapshot(f.installed);
  const result = await f.run();
  assert.equal(result.installed, true);
  assert.deepEqual(f.installationSnapshot(result.receipt.backup), before);
  assert.equal(fs.readFileSync(path.join(f.installed, "config.json"), "utf8"), f.originalConfig);
  assert.equal(fs.statSync(path.dirname(result.receipt.backup)).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(f.installed, "owner-notes/keep.txt"), "utf8"), "preserve all files\n");
  const preview = await f.rollbackInstallation(result.receipt);
  assert.equal(preview.restored, false);
  await f.rollbackInstallation(result.receipt, {
    execute: true, hostsStopped: true, confirmation: `rollback ${hash(JSON.stringify(result.receipt))}`,
  });
  assert.deepEqual(f.installationSnapshot(f.installed), before);
});

test("pinned descriptor additions preserve unrelated settings and existing scopes", async t => {
  const f = await fixture(t);
  const scope = await descriptor(f);
  const existing = { ...scope, label: "existing", command: scope.command.replace(" :core:", " :other:") };
  fs.writeFileSync(path.join(f.installed, "config.json"), JSON.stringify({ reviewCap: 7, dataDir: f.dataDir, localMavenScopes: [existing] }));
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  await f.run();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.installed, "config.json"))), {
    reviewCap: 7, dataDir: f.dataDir, localMavenScopes: [existing, scope],
  });
});

for (const kind of ["duplicate", "conflict", "invalid", "changed-pin"]) {
  test(`rejects ${kind} scope without changing the installation`, async t => {
    const f = await fixture(t);
    const scope = await descriptor(f);
    if (kind === "duplicate" || kind === "conflict") {
      const existing = { ...scope };
      if (kind === "conflict") existing.sha = "a".repeat(40);
      fs.writeFileSync(path.join(f.installed, "config.json"), JSON.stringify({ dataDir: f.dataDir, localMavenScopes: [existing] }));
      f.request.installedHash = f.installationSnapshot(f.installed).hash;
    } else {
      fs.writeFileSync(f.request.scopesFile, JSON.stringify({ localMavenScopes: [{ ...scope, destination: "/remote" }] }));
      if (kind === "invalid") f.request.scopesHash = fileHash(f.request.scopesFile);
    }
    const before = f.installationSnapshot(f.installed);
    await assert.rejects(f.run(), /scope|descriptor|destination|duplicate|conflict/i);
    assert.deepEqual(f.installationSnapshot(f.installed), before);
  });
}

test("rejects unknown runtime source even with a refreshed installed snapshot", async t => {
  const f = await fixture(t);
  fs.appendFileSync(path.join(f.installed, "lib/policy.mjs"), "// unknown change\n");
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  await assert.rejects(f.run(), /unsupported|source/i);
});

test("upgrades only the exact previous reviewed runtime release", async t => {
  const f = await fixture(t);
  const previous = fs.readFileSync(path.join(source, "PREVIOUS.sha256"), "utf8");
  assert.equal(hash(previous), "59e670c61650bbdf50611d0b01121317b1eb21db683b63b4502a0c98fa853ee1", "previous manifest is the PR #17 release");
  const installer = await import(`${pathToFileURL(path.join(f.candidate, "owner-install.mjs")).href}?previous`);
  fs.appendFileSync(path.join(f.installed, "lib/policy.mjs"), "// previous release bytes\n");
  const entries = f.installationSnapshot(f.installed).entries.filter(e => e[1] === "file" && e[0].endsWith(".mjs"));
  fs.writeFileSync(path.join(f.candidate, "PREVIOUS.sha256"), entries.map(e => `${e[3]}  ${e[0]}`).join("\n") + "\n");
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  const result = await installer.prepareInstallation(f.request);
  assert.equal(result.installed, false);
  fs.appendFileSync(path.join(f.installed, "lib/policy.mjs"), "// unknown change\n");
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  await assert.rejects(installer.prepareInstallation(f.request), /unsupported|source/i);
});

test("rejects candidate changes before imports, even when its manifest is rewritten", async t => {
  const f = await fixture(t);
  const helper = path.join(f.candidate, "lib/local-maven.mjs");
  const old = fileHash(helper);
  const marker = path.join(f.root, "imported");
  fs.appendFileSync(helper, `\nfs.writeFileSync(${JSON.stringify(marker)}, "bad");\n`);
  const manifest = path.join(f.candidate, "SOURCE.sha256");
  fs.writeFileSync(manifest, fs.readFileSync(manifest, "utf8").replace(old, fileHash(helper)));
  await assert.rejects(f.run(), /hash|integrity/i);
  assert.equal(fs.existsSync(marker), false);
});

for (const kind of ["installed", "candidate", "backup", "dangling", "ancestor"]) {
  test(`rejects ${kind} symlinks before writing`, async t => {
    const f = await fixture(t);
    if (kind === "installed" || kind === "dangling") {
      fs.symlinkSync(path.join(f.root, kind === "dangling" ? "missing" : "candidate"), path.join(f.installed, "link"));
    } else if (kind === "candidate") {
      const file = path.join(f.candidate, "lib/local-maven.mjs");
      fs.renameSync(file, `${file}.real`);
      fs.symlinkSync(`${file}.real`, file);
    } else if (kind === "backup") {
      fs.symlinkSync(f.candidate, f.request.backupParent);
    } else {
      fs.symlinkSync(path.dirname(f.installed), path.join(f.root, "alias"));
      f.request.installed = path.join(f.root, "alias/work-ledger");
    }
    await assert.rejects(f.run(), /symlink|canonical|regular/i);
  });
}

test("rejects staging inside discovery or overlapping the installation", async t => {
  const f = await fixture(t);
  for (const parent of [path.join(f.root, "home/extensions/backups"), path.join(f.installed, "backups"), f.candidate]) {
    f.request.backupParent = parent;
    await assert.rejects(f.run(), /discovery|overlap|outside/i);
  }
});

test("detects unrelated concurrent drift immediately before replacement", async t => {
  const f = await fixture(t);
  const copy = fs.cpSync;
  t.mock.method(fs, "cpSync", (from, to, ...args) => {
    const result = copy(from, to, ...args);
    if (from === f.installed) fs.appendFileSync(path.join(f.installed, "owner-notes/keep.txt"), "new owner note\n");
    return result;
  });
  await assert.rejects(f.run(), /changed|drift/i);
  assert.match(fs.readFileSync(path.join(f.installed, "owner-notes/keep.txt"), "utf8"), /new owner note/);
});

test("failed stage rename restores the exact original", async t => {
  const f = await fixture(t);
  const before = f.installationSnapshot(f.installed);
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (path.basename(from) === "staged" && to === f.installed) throw new Error("stage rename failed");
    return rename(from, to);
  });
  await assert.rejects(f.run(), /restored/i);
  assert.deepEqual(f.installationSnapshot(f.installed), before);
});

test("rollback rejects drift in installed files and backup files", async t => {
  const f = await fixture(t);
  const result = await f.run();
  fs.appendFileSync(path.join(f.installed, "owner-notes/keep.txt"), "new\n");
  await assert.rejects(f.rollbackInstallation(result.receipt), /changed|drift/i);
  fs.writeFileSync(path.join(f.installed, "owner-notes/keep.txt"), "preserve all files\n");
  fs.appendFileSync(path.join(result.receipt.backup, "owner-notes/keep.txt"), "bad\n");
  await assert.rejects(f.rollbackInstallation(result.receipt), /changed|drift/i);
});

test("CLI import and missing or unknown options cannot install", async t => {
  const f = await fixture(t);
  const script = path.join(source, "owner-install.mjs");
  for (const args of [[], ["--install"], ["--unknown"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /usage|request|option|argument/i);
  }
  assert.equal(fs.existsSync(f.request.backupParent), false);
});

test("the CLI binds install and rollback to the exact reviewed request and receipt", async t => {
  const f = await fixture(t);
  const requestFile = path.join(f.root, "request.json");
  fs.writeFileSync(requestFile, JSON.stringify(f.request, null, 2));
  const pin = fileHash(requestFile);
  const script = path.join(source, "owner-install.mjs");
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const preview = cli("--request", requestFile, "--sha256", pin);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).installed, false);
  assert.equal(fs.existsSync(f.request.backupParent), false);
  const denied = cli("--request", requestFile, "--sha256", pin, "--install", "--hosts-stopped", "--confirm", "install yes");
  assert.notEqual(denied.status, 0);
  const installed = cli("--request", requestFile, "--sha256", pin, "--install", "--hosts-stopped", "--confirm", `install ${pin}`);
  assert.equal(installed.status, 0, installed.stderr);
  const result = JSON.parse(installed.stdout);
  const restored = cli("--rollback", result.receiptFile, "--sha256", result.receiptHash, "--install", "--hosts-stopped", "--confirm", `rollback ${result.receiptHash}`);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(JSON.parse(restored.stdout).restored, true);
  fs.appendFileSync(requestFile, "\n");
  const drift = cli("--request", requestFile, "--sha256", pin);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /integrity/);
});

test("scope pin failure occurs before any reviewed helper import", async t => {
  const f = await fixture(t);
  await descriptor(f);
  const marker = path.join(f.root, "imported"), loader = path.join(f.root, "observer.mjs");
  fs.writeFileSync(loader, `import fs from "node:fs";
export async function load(url, context, next) {
  if (url.includes("guard-validate-") && url.endsWith("/lib/local-maven.mjs")) {
    fs.writeFileSync(${JSON.stringify(marker)}, "imported");
  }
  return next(url, context);
}`);
  const request = path.join(f.root, "request.json");
  fs.writeFileSync(request, JSON.stringify(f.request));
  fs.appendFileSync(f.request.scopesFile, "\n");
  const result = spawnSync(process.execPath, ["--experimental-loader", loader,
    path.join(source, "owner-install.mjs"), "--request", request, "--sha256", fileHash(request)], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scope hash/i);
  assert.equal(fs.existsSync(marker), false);
});

test("staged code corruption cannot replace the original", async t => {
  const f = await fixture(t);
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    rename(from, to);
    if (to.endsWith("/staged/lib/policy.mjs")) fs.appendFileSync(to, "// corrupt\n");
  });
  await assert.rejects(f.run(), /staged code integrity/i);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

test("a failed backup rename leaves the installation untouched", async t => {
  const f = await fixture(t);
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (from === f.installed) throw new Error("backup rename failed");
    return rename(from, to);
  });
  await assert.rejects(f.run(), /backup rename failed/i);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

test("a double rename failure names the recoverable original", async t => {
  const f = await fixture(t);
  const rename = fs.renameSync;
  let original;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (from === f.installed) original = to;
    if (to === f.installed) throw new Error("destination unavailable");
    return rename(from, to);
  });
  await assert.rejects(f.run(), error => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.message.includes(original));
    return true;
  });
  assert.equal(f.installationSnapshot(original).hash, f.request.installedHash);
});

test("rollback rename failure restores the newer installation", async t => {
  const f = await fixture(t);
  const result = await f.run(), rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (from === result.receipt.backup) throw new Error("rollback rename failed");
    return rename(from, to);
  });
  await assert.rejects(f.rollbackInstallation(result.receipt, {
    execute: true, hostsStopped: true, confirmation: `rollback ${hash(JSON.stringify(result.receipt))}`,
  }), /original files were restored/i);
  assert.equal(f.installationSnapshot(f.installed).hash, result.receipt.installedHash);
  assert.equal(f.installationSnapshot(result.receipt.backup).hash, result.receipt.originalHash);
});

test("an independently pinned descriptor with a wrong source cannot install", async t => {
  const f = await fixture(t);
  const scope = await descriptor(f);
  scope.sha = "a".repeat(40);
  fs.writeFileSync(f.request.scopesFile, JSON.stringify({ localMavenScopes: [scope] }));
  f.request.scopesHash = fileHash(f.request.scopesFile);
  await assert.rejects(f.run(), /source.*reviewed clean/i);
});

test("descriptor repository must match the independently resolved project", async t => {
  const f = await fixture(t);
  const scope = await descriptor(f);
  scope.repo = "example/different";
  fs.writeFileSync(f.request.scopesFile, JSON.stringify({ localMavenScopes: [scope] }));
  f.request.scopesHash = fileHash(f.request.scopesFile);
  await assert.rejects(f.run(), /repository/i);
});

test("backup staging cannot write inside the configured ledger directory", async t => {
  const f = await fixture(t);
  const dataDir = path.join(f.root, "ledger");
  fs.writeFileSync(path.join(f.installed, "config.json"), JSON.stringify({ dataDir }));
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  f.request.backupParent = path.join(dataDir, "backup");
  await assert.rejects(f.run(), /overlap|ledger/i);
  assert.equal(fs.existsSync(dataDir), false);
});

test("a staged configuration edit after snapshot is rejected", async t => {
  const f = await fixture(t);
  const write = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (file, bytes, ...args) => {
    write(file, bytes, ...args);
    if (typeof file === "string" && file.endsWith("/receipt.json")) {
      fs.appendFileSync(path.join(path.dirname(file), "staged/config.json"), "\n");
    }
  });
  await assert.rejects(f.run(), /changed|drift/i);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

test("rollback rechecks incoming backup after displacing the current installation", async t => {
  const f = await fixture(t);
  const result = await f.run(), rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    rename(from, to);
    if (from === f.installed) fs.appendFileSync(path.join(result.receipt.backup, "owner-notes/keep.txt"), "interleaved change\n");
  });
  await assert.rejects(f.rollbackInstallation(result.receipt, {
    execute: true, hostsStopped: true, confirmation: `rollback ${hash(JSON.stringify(result.receipt))}`,
  }), /restored.*drift|drift.*restored/i);
  assert.equal(f.installationSnapshot(f.installed).hash, result.receipt.installedHash);
});

for (const kind of ["discovery", "ledger", "candidate"]) {
  test(`preview rejects a temporary root inside ${kind} before staging bytes`, async t => {
    const f = await fixture(t);
    const temporary = kind === "discovery" ? path.dirname(f.installed) : kind === "ledger" ? f.dataDir : f.candidate;
    fs.mkdirSync(temporary, { recursive: true });
    const before = fs.readdirSync(temporary);
    t.mock.method(os, "tmpdir", () => temporary);
    await assert.rejects(f.prepareInstallation(f.request), /discovery|overlap|ledger/i);
    assert.deepEqual(fs.readdirSync(temporary), before);
  });
}

test("a symlinked ledger directory cannot receive backup or validation stages", async t => {
  const f = await fixture(t);
  fs.mkdirSync(f.dataDir, { mode: 0o700 });
  const alias = path.join(f.root, "ledger-alias");
  fs.symlinkSync(f.dataDir, alias);
  fs.writeFileSync(path.join(f.installed, "config.json"), JSON.stringify({ dataDir: alias }));
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  f.request.backupParent = path.join(f.dataDir, "backup");
  await assert.rejects(f.run(), /symlink|canonical/i);
  assert.deepEqual(fs.readdirSync(f.dataDir), []);
});

test("descriptor additions preserve pinned effective scopes from external configuration", async t => {
  const f = await fixture(t);
  const added = await descriptor(f), existing = { ...added, label: "external", command: added.command.replace(" :core:", " :other:") };
  fs.mkdirSync(f.dataDir);
  const configFile = path.join(f.dataDir, "config.json");
  const bytes = JSON.stringify({ localMavenScopes: [existing], reviewCap: 9 });
  fs.writeFileSync(configFile, bytes);
  f.request.ledgerConfigHash = fileHash(configFile);
  await f.run();
  const local = JSON.parse(fs.readFileSync(path.join(f.installed, "config.json")));
  assert.deepEqual(local.localMavenScopes, [existing, added]);
  assert.equal(local.reviewCap, 7);
  assert.equal(fs.readFileSync(configFile, "utf8"), bytes);
});

test("unreviewed or conflicting external scopes cannot be shadowed", async t => {
  const f = await fixture(t);
  const added = await descriptor(f);
  fs.mkdirSync(f.dataDir);
  const configFile = path.join(f.dataDir, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ localMavenScopes: [added] }));
  await assert.rejects(f.run(), /configuration.*hash|external.*pin|ledger.*pin/i);
  f.request.ledgerConfigHash = fileHash(configFile);
  await assert.rejects(f.run(), /duplicate|conflict/i);
});

test("external configuration drift before replacement leaves the installation unchanged", async t => {
  const f = await fixture(t);
  await descriptor(f);
  fs.mkdirSync(f.dataDir);
  const configFile = path.join(f.dataDir, "config.json");
  fs.writeFileSync(configFile, "{}");
  f.request.ledgerConfigHash = fileHash(configFile);
  const copy = fs.cpSync;
  t.mock.method(fs, "cpSync", (from, to, ...args) => {
    copy(from, to, ...args);
    if (from === f.installed) fs.writeFileSync(configFile, '{"localMavenScopes": []}');
  });
  await assert.rejects(f.run(), /configuration.*changed|configuration.*hash/i);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

test("preserves directory modes when the Node copy operation omits them", async t => {
  const f = await fixture(t);
  const copy = fs.cpSync;
  t.mock.method(fs, "cpSync", (from, to, ...args) => {
    copy(from, to, ...args);
    if (from === f.installed) fs.chmodSync(path.join(to, "owner-notes"), 0o755);
  });
  const result = await f.run();
  assert.equal(fs.statSync(path.join(f.installed, "owner-notes")).mode & 0o777, 0o700);
  assert.equal(f.installationSnapshot(result.receipt.backup).hash, f.request.installedHash);
});

test("directory mode preservation cannot follow an injected staged symlink", async t => {
  const f = await fixture(t);
  const outside = path.join(f.root, "outside"), copy = fs.cpSync;
  fs.mkdirSync(outside, { mode: 0o755 });
  t.mock.method(fs, "cpSync", (from, to, ...args) => {
    copy(from, to, ...args);
    if (from === f.installed) {
      fs.rmSync(path.join(to, "owner-notes"), { recursive: true });
      fs.symlinkSync(outside, path.join(to, "owner-notes"));
    }
  });
  await assert.rejects(f.run(), /symlink/i);
  assert.equal(fs.statSync(outside).mode & 0o777, 0o755);
});

for (const kind of ["ledger", "candidate", "temporary", "future-ledger", "discovery"]) {
  test(`case aliases cannot place ${kind} inside protected paths`, async t => {
    const f = await fixture(t);
    fs.mkdirSync(f.dataDir, { mode: 0o700 });
    const alias = path.join(f.root, "LEDGER");
    if (!fs.existsSync(alias)) return t.skip("Requires a case-insensitive fixture filesystem.");
    if (kind === "candidate") {
      f.request.candidate = f.installed.replace("work-ledger", "WORK-LEDGER");
    } else if (kind === "discovery") {
      f.request.backupParent = path.join(path.dirname(f.installed).replace("extensions", "EXTENSIONS"), "backups");
    } else if (kind === "temporary") {
      t.mock.method(os, "tmpdir", () => alias);
    } else if (kind === "future-ledger") {
      fs.writeFileSync(path.join(f.installed, "config.json"), JSON.stringify({ dataDir: path.join(f.dataDir, "future") }));
      f.request.installedHash = f.installationSnapshot(f.installed).hash;
      f.request.backupParent = path.join(alias, "future", "backups");
    } else {
      f.request.backupParent = path.join(alias, "backups");
    }
    await assert.rejects(f.run(), /overlap|discovery/i);
    assert.deepEqual(fs.readdirSync(f.dataDir), []);
  });
}

test("rejects configured relative dataDir without assuming the owner's host cwd", async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.installed, "config.json"), '{"dataDir":"relative-ledger"}');
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  await assert.rejects(f.run(), /absolute|relative/i);
});

for (const value of ["~/ledger", "relative-ledger"]) {
  test(`rejects ambiguous runtime WORK_LEDGER_DIR ${value}`, async t => {
    const f = await fixture(t);
    const previous = process.env.WORK_LEDGER_DIR;
    t.after(() => {
      if (previous === undefined) delete process.env.WORK_LEDGER_DIR;
      else process.env.WORK_LEDGER_DIR = previous;
    });
    process.env.WORK_LEDGER_DIR = value;
    await assert.rejects(f.run(), /absolute|relative|ledger/i);
    assert.equal(fs.existsSync(f.request.backupParent), false);
  });
}

test("configured dataDir expands tilde without expanding environment paths", async t => {
  const f = await fixture(t);
  t.mock.method(os, "homedir", () => f.root);
  fs.writeFileSync(path.join(f.installed, "config.json"), '{"dataDir":"~/ledger"}');
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  f.request.backupParent = path.join(f.dataDir, "backups");
  await assert.rejects(f.run(), /overlap|ledger/i);
  assert.equal(fs.existsSync(f.dataDir), false);
});

for (const kind of ["configuration", "unrelated-file", "new-file", "directory-mode"]) {
  test(`rejects unapproved ${kind} edits during the staged overlay`, async t => {
    const f = await fixture(t), rename = fs.renameSync;
    t.mock.method(fs, "renameSync", (from, to) => {
      rename(from, to);
      if (to.endsWith("/staged/extension.mjs")) {
        const staged = path.dirname(to);
        if (kind === "configuration") fs.writeFileSync(path.join(staged, "config.json"), '{"reviewCap":99}');
        if (kind === "unrelated-file") fs.writeFileSync(path.join(staged, "owner-notes/keep.txt"), "not approved");
        if (kind === "new-file") fs.writeFileSync(path.join(staged, "unexpected.txt"), "not approved");
        if (kind === "directory-mode") fs.chmodSync(path.join(staged, "owner-notes"), 0o755);
      }
    });
    await assert.rejects(f.run(), /changed|drift|integrity/i);
    assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
  });
}

test("rejects a runtime-readable configuration filename with noncanonical case", async t => {
  const f = await fixture(t);
  t.mock.method(os, "homedir", () => f.root);
  fs.renameSync(path.join(f.installed, "config.json"), path.join(f.installed, "config.JSON"));
  if (!fs.existsSync(path.join(f.installed, "config.json"))) return t.skip("Requires a case-insensitive fixture filesystem.");
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  f.request.backupParent = path.join(f.dataDir, "backups");
  await assert.rejects(f.run(), /configuration.*name|config.*case/i);
  assert.equal(fs.existsSync(f.dataDir), false);
});

test("rejects a transient second configuration read outside the pinned snapshot", async t => {
  const f = await fixture(t), read = fs.readFileSync;
  const file = path.join(f.installed, "config.json");
  let count = 0;
  t.mock.method(fs, "readFileSync", (target, ...args) => {
    if (target === file && ++count === 2) {
      fs.writeFileSync(file, f.originalConfig.replace('"reviewCap": 7', '"reviewCap": 99'));
      const bytes = read(target, ...args);
      fs.writeFileSync(file, f.originalConfig);
      return bytes;
    }
    return read(target, ...args);
  });
  await assert.rejects(f.run(), /configuration.*changed|configuration.*snapshot/i);
  assert.equal(fs.readFileSync(file, "utf8"), f.originalConfig);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

test("special permission changes invalidate the complete installation pin", async t => {
  const f = await fixture(t);
  fs.chmodSync(path.join(f.installed, "owner-notes"), 0o1700);
  await assert.rejects(f.run(), /snapshot.*changed|drift/i);
});

test("install and rollback preserve special directory permission bits", async t => {
  const f = await fixture(t);
  fs.chmodSync(path.join(f.installed, "owner-notes"), 0o1700);
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  const result = await f.run();
  assert.equal(fs.statSync(path.join(f.installed, "owner-notes")).mode & 0o7777, 0o1700);
  await f.rollbackInstallation(result.receipt, {
    execute: true, hostsStopped: true, confirmation: `rollback ${hash(JSON.stringify(result.receipt))}`,
  });
  assert.equal(fs.statSync(path.join(f.installed, "owner-notes")).mode & 0o7777, 0o1700);
});

for (const kind of ["malformed", "conflicting"]) {
  test(`rejects ${kind} effective external scopes without adding descriptors`, async t => {
    const f = await fixture(t);
    const scope = await descriptor(f);
    delete f.request.scopesFile;
    delete f.request.scopesHash;
    fs.mkdirSync(f.dataDir);
    const file = path.join(f.dataDir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ localMavenScopes: kind === "malformed" ? [{}] : [scope, scope] }));
    f.request.ledgerConfigHash = fileHash(file);
    await assert.rejects(f.run(), /scope|descriptor|duplicate|conflict/i);
    assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
  });
}

test("effective external configuration needs a pin even without scope additions", async t => {
  const f = await fixture(t);
  delete f.request.ledgerConfigHash;
  await assert.rejects(f.run(), /external.*pin|configuration.*hash|ledger.*pin/i);
});

test("valid effective external scopes survive a no-addition installation without local shadowing", async t => {
  const f = await fixture(t);
  const scope = await descriptor(f);
  delete f.request.scopesFile;
  delete f.request.scopesHash;
  fs.mkdirSync(f.dataDir);
  const external = path.join(f.dataDir, "config.json");
  const bytes = JSON.stringify({ localMavenScopes: [scope], keep: "external" });
  fs.writeFileSync(external, bytes);
  f.request.ledgerConfigHash = fileHash(external);
  await f.run();
  assert.equal(fs.readFileSync(path.join(f.installed, "config.json"), "utf8"), f.originalConfig);
  assert.equal(fs.readFileSync(external, "utf8"), bytes);
});

test("special file permissions survive installation and remain part of the snapshot", async t => {
  const f = await fixture(t);
  const file = path.join(f.installed, "owner-notes/keep.txt");
  fs.chmodSync(file, 0o4600);
  const changed = f.installationSnapshot(f.installed).hash;
  assert.notEqual(changed, f.request.installedHash);
  f.request.installedHash = changed;
  await f.run();
  assert.equal(fs.statSync(file).mode & 0o7777, 0o4600);
});

for (const mode of [0o400, 0o444, 0o4400]) {
  for (const additions of [false, true]) {
    test(`a non-root owner preserves config mode ${mode.toString(8)} with additions=${additions}`, async t => {
      assert.notEqual(process.getuid(), 0, "This regression must run as a non-root owner.");
      const f = await fixture(t);
      const scope = additions ? await descriptor(f) : null;
      const configFile = path.join(f.installed, "config.json");
      fs.chmodSync(configFile, mode);
      f.request.installedHash = f.installationSnapshot(f.installed).hash;
      const preview = await f.prepareInstallation(f.request);
      assert.equal(preview.validated, true);
      assert.equal(fs.statSync(configFile).mode & 0o7777, mode);
      const result = await f.run();
      assert.equal(fs.statSync(configFile).mode & 0o7777, mode);
      const bytes = fs.readFileSync(configFile, "utf8");
      if (additions) {
        assert.deepEqual(JSON.parse(bytes), { ...JSON.parse(f.originalConfig), localMavenScopes: [scope] });
      } else {
        assert.equal(bytes, f.originalConfig);
      }
      await f.rollbackInstallation(result.receipt, {
        execute: true, hostsStopped: true, confirmation: `rollback ${hash(JSON.stringify(result.receipt))}`,
      });
      assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
      assert.equal(fs.statSync(configFile).mode & 0o7777, mode);
    });
  }
}

test("approved staging failure leaves the read-only original unchanged", async t => {
  const f = await fixture(t);
  await descriptor(f);
  fs.chmodSync(path.join(f.installed, "config.json"), 0o400);
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  const write = fs.writeFileSync, open = fs.openSync;
  let stagedFd;
  t.mock.method(fs, "openSync", (file, ...args) => {
    const fd = open(file, ...args);
    if (typeof file === "string" && file.startsWith(f.request.backupParent) && file.endsWith("/approved-bytes")) stagedFd = fd;
    return fd;
  });
  t.mock.method(fs, "writeFileSync", (file, ...args) => {
    if (file === stagedFd) throw new Error("configuration staging failed");
    return write(file, ...args);
  });
  await assert.rejects(f.run(), /configuration staging failed/);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

test("private approved replacement cannot redirect permission changes through a symlink", async t => {
  const f = await fixture(t);
  await descriptor(f);
  fs.chmodSync(path.join(f.installed, "config.json"), 0o400);
  f.request.installedHash = f.installationSnapshot(f.installed).hash;
  const outside = path.join(f.root, "outside.txt"), open = fs.openSync;
  fs.writeFileSync(outside, "do not change", { mode: 0o644 });
  t.mock.method(fs, "openSync", (file, ...args) => {
    const fd = open(file, ...args);
    if (typeof file === "string" && file.startsWith(f.request.backupParent) && file.endsWith("/approved-bytes")) {
      fs.unlinkSync(file);
      fs.symlinkSync(outside, file);
    }
    return fd;
  });
  await assert.rejects(f.run(), /symlink/i);
  assert.equal(fs.readFileSync(outside, "utf8"), "do not change");
  assert.equal(fs.statSync(outside).mode & 0o7777, 0o644);
  assert.equal(f.installationSnapshot(f.installed).hash, f.request.installedHash);
});

for (const fileMode of [0o400, 0o444, 0o4555]) {
  for (const directoryMode of [0o500, 0o555, 0o1500]) {
    for (const additions of [false, true]) {
      test(`non-root install/rollback preserves files=${fileMode.toString(8)} directories=${directoryMode.toString(8)} additions=${additions}`, async t => {
        assert.notEqual(process.getuid(), 0, "This regression must run as a non-root owner.");
        const f = await fixture(t);
        const scope = additions ? await descriptor(f) : null;
        const configFile = path.join(f.installed, "config.json");
        fs.chmodSync(configFile, fileMode);
        for (const entry of f.installationSnapshot(f.installed).entries) {
          if (entry[0].endsWith(".mjs")) fs.chmodSync(path.join(f.installed, entry[0]), fileMode);
        }
        for (const relative of ["owner-notes", "lib"]) fs.chmodSync(path.join(f.installed, relative), directoryMode);
        const before = f.installationSnapshot(f.installed);
        f.request.installedHash = before.hash;
        assert.equal((await f.prepareInstallation(f.request)).validated, true);
        assert.deepEqual(f.installationSnapshot(f.installed), before);
        const result = await f.run();
        const expected = before.entries.map(entry => entry[0] === "config.json" && additions
          ? [...entry.slice(0, 3), hash(JSON.stringify({ ...JSON.parse(f.originalConfig), localMavenScopes: [scope] }, null, 2) + "\n")]
          : entry);
        assert.deepEqual(f.installationSnapshot(f.installed).entries, expected);
        assert.deepEqual(f.installationSnapshot(result.receipt.backup), before);
        await f.rollbackInstallation(result.receipt, {
          execute: true, hostsStopped: true, confirmation: `rollback ${hash(JSON.stringify(result.receipt))}`,
        });
        assert.deepEqual(f.installationSnapshot(f.installed), before);
      });
    }
  }
}

for (const kind of ["file", "directory"]) {
  test(`preview rejects an unreadable ${kind} without creating a backup`, async t => {
    assert.notEqual(process.getuid(), 0);
    const f = await fixture(t);
    fs.chmodSync(path.join(f.installed, kind === "file" ? "lib/policy.mjs" : "lib"), kind === "file" ? 0o200 : 0o100);
    await assert.rejects(f.prepareInstallation(f.request), { code: "EACCES" });
    assert.equal(fs.existsSync(f.request.backupParent), false);
  });
}

for (const mode of [0o500, 0o555, 0o1500]) {
  test(`preview refuses root mode ${mode.toString(8)} before any staging or installation`, async t => {
    assert.notEqual(process.getuid(), 0);
    const f = await fixture(t);
    fs.chmodSync(f.installed, mode);
    const before = f.installationSnapshot(f.installed);
    f.request.installedHash = before.hash;
    await assert.rejects(f.prepareInstallation(f.request), /cross-parent.*writable installation root/i);
    await assert.rejects(f.run(), /cross-parent.*writable installation root/i);
    assert.deepEqual(f.installationSnapshot(f.installed), before);
    assert.equal(fs.existsSync(f.request.backupParent), false);
  });
}

for (const failure of ["write", "rename", "directory-drift"]) {
  test(`a ${failure} failure preserves the read-only original bytes and modes`, async t => {
    const f = await fixture(t);
    await descriptor(f);
    fs.chmodSync(path.join(f.installed, "config.json"), 0o400);
    fs.chmodSync(path.join(f.installed, "lib/policy.mjs"), 0o444);
    fs.chmodSync(path.join(f.installed, "lib"), 0o500);
    const before = f.installationSnapshot(f.installed);
    f.request.installedHash = before.hash;
    const write = fs.writeFileSync, rename = fs.renameSync, open = fs.openSync;
    let stagedFd;
    t.mock.method(fs, "openSync", (file, ...args) => {
      const fd = open(file, ...args);
      if (typeof file === "string" && file.startsWith(f.request.backupParent) && file.endsWith("/approved-bytes")) stagedFd = fd;
      return fd;
    });
    t.mock.method(fs, "writeFileSync", (file, ...args) => {
      if (failure === "write" && file === stagedFd) throw new Error("approved write failed");
      return write(file, ...args);
    });
    t.mock.method(fs, "renameSync", (from, to) => {
      if (failure === "rename" && from.endsWith("/staged")) throw new Error("installation rename failed");
      rename(from, to);
      if (failure === "directory-drift" && to.endsWith("/staged/extension.mjs")) {
        fs.chmodSync(path.join(path.dirname(to), "lib"), 0o777);
      }
    });
    await assert.rejects(f.run(), /approved write failed|installation rename failed|changed|drift|integrity/i);
    assert.deepEqual(f.installationSnapshot(f.installed), before);
  });
}
