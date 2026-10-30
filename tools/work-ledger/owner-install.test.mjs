import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL(".", import.meta.url));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = file => hash(fs.readFileSync(file));

async function fixture(t) {
  const api = await import("./owner-install.mjs");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-owner-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
  const write = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (file, bytes, ...args) => {
    write(file, bytes, ...args);
    if (file.endsWith("/staged/lib/policy.mjs")) write(file, "// corrupt\n", { flag: "a" });
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
    if (file.endsWith("/receipt.json")) {
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
