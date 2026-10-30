import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const identity = object => digest(JSON.stringify(object));
const runtime = ["extension.mjs", ...[
  "approvals", "classify", "gh", "grants", "guard-switches", "local-maven", "policy", "shell", "store", "units",
].map(name => `lib/${name}.mjs`)].sort();
const inside = (a, b) => a === b || a.startsWith(`${b}${path.sep}`);
const fail = message => { throw new Error(message); };

function canonical(file) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail("Use normalized absolute paths.");
  let current = path.parse(file).root;
  for (const part of file.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) fail("A path uses a symlink.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function read(file) {
  canonical(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1) fail("Expected a regular file without hard links.");
  return fs.readFileSync(file);
}

function object(bytes) {
  const value = JSON.parse(bytes);
  if (!value || Array.isArray(value) || typeof value !== "object") fail("Configuration must be a JSON object.");
  return value;
}

function manifest(bytes) {
  const entries = new Map();
  for (const line of bytes.toString().trim().split("\n")) {
    const match = /^([a-f0-9]{64}) {2}(extension\.mjs|lib\/[a-z-]+\.mjs)$/.exec(line);
    if (!match || entries.has(match[2])) fail("Invalid or duplicate source manifest entry.");
    entries.set(match[2], match[1]);
  }
  return entries;
}

export function installationSnapshot(directory) {
  canonical(directory);
  const entries = [];
  function walk(relative) {
    const file = path.join(directory, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) fail("Installation uses a symlink.");
    if (stat.isDirectory()) {
      entries.push([relative, "directory", stat.mode & 0o777]);
      for (const name of fs.readdirSync(file).sort()) walk(path.join(relative, name));
    } else {
      entries.push([relative, "file", stat.mode & 0o777, digest(read(file))]);
    }
  }
  walk("");
  return { hash: identity(entries), entries };
}

function unchanged(directory, expected) {
  if (installationSnapshot(directory).hash !== expected) fail("Installation or backup changed (concurrent drift).");
}

function privateParent(parent, directories) {
  canonical(parent);
  if (parent.split(path.sep).includes("extensions")) fail("Backup/staging must be outside extension discovery.");
  if (directories.some(dir => inside(parent, dir) || inside(dir, parent))) fail("Backup/staging paths must not overlap source or installation.");
  if (fs.existsSync(parent)) {
    const stat = fs.statSync(parent);
    if (!stat.isDirectory() || (stat.mode & 0o077) || stat.uid !== process.getuid()) fail("Backup parent must be an owner-only private directory.");
  }
}

function authorize(kind, document, options) {
  if (!options.execute) return;
  if (!options.hostsStopped) fail("Confirm all affected extension hosts are stopped.");
  if (options.confirmation !== `${kind} ${identity(document)}`) fail("Exact explicit owner confirmation is required.");
}

function supportedInstalled(snapshot, source) {
  const baseline = manifest(read(path.join(here, "BASELINE.sha256")));
  const files = snapshot.entries.filter(e => e[1] === "file" && e[0].endsWith(".mjs"));
  const matches = allowed => files.length === allowed.size && files.every(e => allowed.get(e[0]) === e[3]);
  if (!matches(baseline) && !matches(source)) fail("Unsupported installed runtime source; review its changes separately.");
}

function release(candidate, sourceHash) {
  const bytes = read(path.join(candidate, "SOURCE.sha256"));
  if (digest(bytes) !== sourceHash) fail("Release manifest integrity hash changed.");
  const hashes = manifest(bytes);
  if (JSON.stringify([...hashes.keys()].sort()) !== JSON.stringify(runtime)) fail("Unsupported release source inventory.");
  const files = new Map();
  for (const [file, hash] of hashes) {
    const bytes = read(path.join(candidate, file));
    if (digest(bytes) !== hash) fail("Candidate code integrity hash changed.");
    files.set(file, bytes);
  }
  return { hashes, files };
}

function configurationInput(request, installed) {
  const old = installed.entries.find(e => e[0] === "config.json");
  const original = old ? read(path.join(request.installed, "config.json")) : null;
  const config = original ? object(original) : {};
  const dataDir = process.env.WORK_LEDGER_DIR || config.dataDir || path.join(os.homedir(), ".copilot/work-ledger");
  if (typeof dataDir !== "string") fail("Configured ledger directory must be a path.");
  const ledgerDir = path.resolve(dataDir.replace(/^~(?=\/|$)/, os.homedir()));
  canonical(ledgerDir);
  privateParent(request.backupParent, [request.candidate, request.installed, ledgerDir]);
  let additions = [];
  if (request.scopesFile || request.scopesHash) {
    const bytes = read(request.scopesFile);
    if (digest(bytes) !== request.scopesHash) fail("Descriptor scope hash changed.");
    const supplied = object(bytes);
    if (Object.keys(supplied).some(key => key !== "localMavenScopes") || !Array.isArray(supplied.localMavenScopes)) fail("Supply only a localMavenScopes array.");
    additions = supplied.localMavenScopes;
  }
  let existing = Object.hasOwn(config, "localMavenScopes") ? config.localMavenScopes : [];
  let recheck = () => {};
  if (additions.length && !Object.hasOwn(config, "localMavenScopes")) {
    if (!/^(absent|[a-f0-9]{64})$/.test(request.ledgerConfigHash || "")) fail("Review and pin the external configuration hash before adding scopes.");
    const configFile = path.join(ledgerDir, "config.json");
    const externalBytes = () => {
      try { return read(configFile); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    };
    const bytes = externalBytes();
    const checkHash = value => value === null ? "absent" : digest(value);
    if (checkHash(bytes) !== request.ledgerConfigHash) fail("External configuration hash changed.");
    const external = bytes ? object(bytes) : {};
    existing = Object.hasOwn(external, "localMavenScopes") ? external.localMavenScopes : [];
    recheck = () => {
      if (checkHash(externalBytes()) !== request.ledgerConfigHash) fail("External configuration changed during preparation.");
    };
  }
  if (!Array.isArray(existing)) fail("Existing localMavenScopes must be an array.");
  return { original, config, additions, existing, ledgerDir, recheck };
}

async function configuration(request, input, stage) {
  const { original, config, additions, existing, ledgerDir } = input;
  // Only private, verified byte copies can execute during descriptor validation.
  const { localScopeProblem, localSourceProblem } = await import(pathToFileURL(path.join(stage, "lib/local-maven.mjs")).href);
  const { makeLookups } = await import(pathToFileURL(path.join(stage, "lib/gh.mjs")).href);
  const labels = new Set(), commands = new Set();
  for (const scope of [...existing, ...additions]) {
    const problem = localScopeProblem(scope);
    if (problem) fail(`Invalid scope descriptor: ${problem}`);
    const label = JSON.stringify([scope.repo.toLowerCase(), scope.label]);
    const command = JSON.stringify([scope.repo.toLowerCase(), scope.cwd, scope.command]);
    if (labels.has(label) || commands.has(command)) fail("Duplicate or conflicting scope; never replace existing scopes implicitly.");
    labels.add(label);
    commands.add(command);
  }
  for (const scope of additions) {
    if ([request.candidate, request.installed, request.backupParent, ledgerDir]
      .some(dir => inside(scope.cwd, dir) || inside(dir, scope.cwd))) fail("Scope overlaps protected installation paths.");
    const lookups = makeLookups({ gh: null });
    if (await lookups.scopeRepo(scope.cwd) !== scope.repo.toLowerCase()) fail("Scope repository does not match the independently resolved project.");
    const problem = await localSourceProblem(scope, lookups);
    if (problem) fail(`Scope source check failed: ${problem}`);
  }
  return additions.length ? Buffer.from(JSON.stringify({ ...config, localMavenScopes: [...existing, ...additions] }, null, 2) + "\n") : original;
}

function writeRelease(directory, files) {
  for (const [file, bytes] of files) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes, { mode: 0o600 });
  }
}

function replace(installed, staged, backup, originalHash, incomingHash, recheck = () => {}) {
  unchanged(installed, originalHash);
  fs.renameSync(installed, backup);
  try {
    unchanged(backup, originalHash);
    unchanged(staged, incomingHash);
    recheck();
    fs.renameSync(staged, installed);
  } catch (error) {
    try { fs.renameSync(backup, installed); }
    catch (restore) { throw new AggregateError([error, restore], `Replacement and restoration failed. Preserve original at ${backup}.`); }
    throw new Error(`Replacement failed; original files were restored: ${error.message}`, { cause: error });
  }
}

export async function prepareInstallation(request, options = {}) {
  authorize("install", request, options);
  for (const key of ["candidate", "installed", "backupParent"]) canonical(request[key]);
  if (inside(request.candidate, request.installed) || inside(request.installed, request.candidate)) fail("Candidate and installed directories must not overlap.");
  privateParent(request.backupParent, [request.candidate, request.installed]);
  const before = installationSnapshot(request.installed);
  if (before.hash !== request.installedHash) fail("Installed snapshot changed since review.");
  const { hashes, files } = release(request.candidate, request.sourceHash);
  supportedInstalled(before, hashes);
  const input = configurationInput(request, before);
  const temporary = fs.realpathSync(os.tmpdir());
  canonical(temporary);
  if (temporary.split(path.sep).includes("extensions")) fail("Validation must be outside extension discovery.");
  if ([request.candidate, request.installed, input.ledgerDir].some(dir => inside(temporary, dir))) fail("Validation temporary root overlaps source, installation, or ledger.");
  const scratch = fs.mkdtempSync(path.join(temporary, "guard-validate-"));
  fs.chmodSync(scratch, 0o700);
  try {
    writeRelease(scratch, files);
    const config = await configuration(request, input, scratch);
    unchanged(request.installed, before.hash);
    input.recheck();
    if (!options.execute) return { installed: false, validated: true, sourceHash: request.sourceHash, requestHash: identity(request) };
    fs.mkdirSync(request.backupParent, { recursive: true, mode: 0o700 });
    privateParent(request.backupParent, [request.candidate, request.installed]);
    if (fs.statSync(request.backupParent).dev !== fs.statSync(request.installed).dev) fail("Backup and installation must share a filesystem.");
    const work = fs.mkdtempSync(path.join(request.backupParent, "install-"));
    fs.chmodSync(work, 0o700);
    const staged = path.join(work, "staged"), backup = path.join(work, "original");
    fs.cpSync(request.installed, staged, { recursive: true, preserveTimestamps: true });
    const copied = installationSnapshot(staged);
    // Node 22 can omit nested directory modes. Verify bytes and types before restoring those modes.
    const content = entries => entries.map(entry => entry[1] === "directory" ? entry.slice(0, 2) : entry);
    if (identity(content(copied.entries)) !== identity(content(before.entries))) fail("Copied installation changed during staging.");
    for (const [file, type, mode] of before.entries) {
      if (type === "directory") fs.chmodSync(path.join(staged, file), mode);
    }
    unchanged(staged, before.hash);
    writeRelease(staged, files);
    if (config) fs.writeFileSync(path.join(staged, "config.json"), config, { mode: 0o600 });
    const installedHash = installationSnapshot(staged).hash;
    const receipt = { installed: request.installed, backup, originalHash: before.hash, installedHash, sourceHash: request.sourceHash };
    const receiptFile = path.join(work, "receipt.json");
    fs.writeFileSync(receiptFile, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
    for (const [file, hash] of hashes) if (digest(read(path.join(staged, file))) !== hash) fail("Staged code integrity hash changed.");
    unchanged(staged, installedHash);
    replace(request.installed, staged, backup, before.hash, installedHash, input.recheck);
    return { installed: true, receipt, receiptFile, receiptHash: identity(receipt), reloadVerified: false };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export async function rollbackInstallation(receipt, options = {}) {
  authorize("rollback", receipt, options);
  canonical(receipt.installed);
  canonical(receipt.backup);
  const work = path.dirname(receipt.backup);
  privateParent(work, [receipt.installed]);
  unchanged(receipt.installed, receipt.installedHash);
  unchanged(receipt.backup, receipt.originalHash);
  if (!options.execute) return { restored: false, validated: true };
  const displaced = path.join(work, "displaced");
  if (fs.existsSync(displaced)) fail("Rollback displacement path already exists.");
  replace(receipt.installed, receipt.backup, displaced, receipt.installedHash, receipt.originalHash);
  return { restored: true, displaced, reloadVerified: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (!["--inspect", "--request", "--rollback", "--sha256", "--confirm", "--install", "--hosts-stopped"].includes(key) || key in values) fail("Unknown or duplicate option.");
      values[key] = ["--install", "--hosts-stopped"].includes(key) ? true : args[++i];
      if (values[key] === undefined) fail("Missing option argument.");
    }
    let result;
    if (values["--inspect"] && Object.keys(values).length === 1) {
      const snapshot = installationSnapshot(values["--inspect"]);
      result = { hash: snapshot.hash, entries: snapshot.entries.length };
    } else {
      const kind = values["--rollback"] ? "rollback" : "install";
      if (!!values["--request"] === !!values["--rollback"] || values["--inspect"]) fail("Usage: --request FILE or --rollback FILE, with --sha256 HASH.");
      const bytes = read(values["--request"] || values["--rollback"]);
      if (digest(bytes) !== values["--sha256"]) fail("Request or receipt integrity hash changed.");
      const document = object(bytes);
      if (values["--install"] && values["--confirm"] !== `${kind} ${values["--sha256"]}`) fail("Exact explicit owner confirmation is required.");
      const options = { execute: values["--install"], hostsStopped: values["--hosts-stopped"], confirmation: `${kind} ${identity(document)}` };
      result = await (kind === "install" ? prepareInstallation : rollbackInstallation)(document, options);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Owner installation stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
