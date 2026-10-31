import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decide, DEFAULT_CONFIG } from "./lib/policy.mjs";
import { emptyLedger } from "./lib/store.mjs";

const PROTECTED = /writes to the work-ledger guard files/;
const PY = ["/usr/bin/python3", "-I"];
const TASKS = ":auth:core:publishMavenPublicationToKitTestRepository :design:compose:publishMavenPublicationToKitTestRepository";

function fixture(t, { listed = true } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ro-monitor-")));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const data = path.join(tmp, "work-ledger");
  const ext = path.join(tmp, "extensions", "work-ledger");
  const work = path.join(tmp, "producer");
  const files = path.join(tmp, "session", "files");
  for (const d of [data, ext, work, files]) fs.mkdirSync(d, { recursive: true });
  const lockFile = path.join(data, "gradle.lock");
  const script = path.join(files, "publication-watchdog.py");
  fs.writeFileSync(script, "#!/usr/bin/env python3\n# reads ps/lsof and signals owned PIDs only\n");
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(script)).digest("hex");
  const config = { ...DEFAULT_CONFIG, readOnlyMonitors: listed ? [{ label: "publication watchdog", interpreter: PY, sha256, argument: "--expected-command" }] : [] };
  const envelope = `/usr/bin/lockf -t 1500 ${lockFile} /bin/bash -c ./scripts/lowmem/gradlew ${TASKS} --offline -PkitRepository=${work}/build/kit-test-repository`;
  // The denied producer call on 2026-10-31T13:16:29Z, with the owner-pinned interpreter prefix.
  const exact = `${PY.join(" ")} ${script} --pid 16569 --parent-pid 4118 --expected-command '${envelope}' --cwd ${work}`;
  const run = (command, { cwd = work, tool = "bash" } = {}) => decide(
    { toolName: tool, args: tool === "bash" ? { command } : { input: `${command}{enter}` }, cwd, sessionId: "s" },
    { data: emptyLedger(), lookups: { gitHead: async () => null, gitDirty: async () => null }, config, now: Date.now(), protectedDirs: [data, ext], lockFile, globalPause: false });
  return { tmp, data, ext, work, files, lockFile, script, envelope, exact, config, run };
}

test("the exact owner-listed monitor call that carries the guard lock envelope is allowed and not rewritten", async t => {
  const f = fixture(t);
  const r = await f.run(f.exact);
  assert.equal(r.deny, null);
  assert.equal(r.modifiedArgs, null);
});

test("without an owner-listed monitor, the same call stays denied", async t => {
  const f = fixture(t, { listed: false });
  assert.match((await f.run(f.exact)).deny, PROTECTED);
});

test("a changed script no longer matches the owner-listed hash", async t => {
  const f = fixture(t);
  fs.appendFileSync(f.script, "open('/tmp/x', 'w')\n");
  assert.match((await f.run(f.exact)).deny, PROTECTED);
});

test("a listed script that lives in, or links into, a guard folder is denied", async t => {
  const f = fixture(t);
  const inside = path.join(f.data, "publication-watchdog.py");
  fs.copyFileSync(f.script, inside);
  assert.match((await f.run(f.exact.replace(f.script, inside))).deny, PROTECTED);
  const link = path.join(f.files, "link.py");
  fs.symlinkSync(inside, link);
  assert.match((await f.run(f.exact.replace(f.script, link))).deny, PROTECTED);
});

test("guard paths outside the exact lock envelope position are denied", async t => {
  const f = fixture(t);
  const ledger = path.join(f.data, "ledger.json");
  const cases = [
    `${f.exact} --log ${ledger}`,
    `${f.exact} --log ~/.copilot/work-ledger/ledger.json`.replace("~/.copilot/work-ledger", f.data),
    f.exact.replace(`--cwd ${f.work}`, `--cwd ${f.ext}`),
    f.exact.replace(f.envelope, f.envelope.replace(f.lockFile, ledger)),
    f.exact.replace(f.envelope, `${f.envelope} ${ledger}`),
    f.exact.replace(f.envelope, `/usr/bin/lockf -t 1500 ${f.lockFile} /bin/rm -f ${f.lockFile}`),
    f.exact.replace(f.envelope, `${f.lockFile}`),
    f.exact.replace("--expected-command", "--target"),
    f.exact.replace(`--expected-command '${f.envelope}'`, `--expected-command='${f.envelope}'`),
    `${f.exact} --expected-command '${f.envelope}'`,
  ];
  for (const c of cases) assert.match((await f.run(c)).deny ?? "", PROTECTED, c);
});

test("interpreter code, wrappers, env prefixes, chains, redirects, and substitutions are denied", async t => {
  const f = fixture(t);
  const cases = [
    `python3 -c 'open("${f.lockFile}","w")' ${f.script} --expected-command '${f.envelope}'`,
    f.exact.replace("/usr/bin/python3 -I ", "/usr/bin/python3 "),
    f.exact.replace("/usr/bin/python3 -I ", "python3 -I "),
    f.exact.replace("/usr/bin/python3 -I ", "/usr/bin/python3 -I -c pass "),
    f.exact.replace("/usr/bin/python3 ", `${f.files}/python3 `),
    f.exact.replace("/usr/bin/python3 ", "/usr/bin/../bin/python3 "),
    `PYTHONSTARTUP=/tmp/evil.py ${f.exact}`,
    `env ${f.exact}`,
    `${f.exact}; rm -f ${f.lockFile}`,
    `${f.exact} && true`,
    `${f.exact} > ${f.lockFile}`,
    `${f.exact} > /tmp/out.log`,
    `${f.exact} --pid "$(rm -f ${f.lockFile})"`,
    `${f.exact} --pid $X`,
    `bash ${f.script} --expected-command '${f.envelope}'`.replace(f.script, `${f.script}`) + ` ; true`,
  ];
  for (const c of cases) assert.match((await f.run(c)).deny ?? "", PROTECTED, c);
});

test("words that bash expands differently from the guard parser are denied", async t => {
  const f = fixture(t);
  const dir = path.dirname(f.script);
  const copy = (name) => { fs.copyFileSync(f.script, path.join(dir, name)); return path.join(dir, name); };
  const listed = f.config.readOnlyMonitors[0].sha256;
  copy("mon[X]py"); copy("monx2epy"); copy("mon{a,b}.py");
  f.config.readOnlyMonitors = [{ interpreter: PY, sha256: listed, argument: "--expected-command" }];
  const cases = [
    f.exact.replace(f.script, path.join(dir, "mon[X]py")),
    f.exact.replace(f.script, `$'${path.join(dir, "mon\\x2epy")}'`),
    f.exact.replace(f.script, path.join(dir, "mon{a,b}.py")),
    f.exact.replace(f.script, `"${f.script}"`),
    f.exact.replace(f.script, `${f.script.slice(0, -3)}\\.py`),
    f.exact.replace(`'${f.envelope}'`, `"${f.envelope}"`),
    f.exact.replace("--pid 16569", "--pid  16569"),
  ];
  for (const c of cases) assert.match((await f.run(c)).deny ?? "", PROTECTED, c);
});

test("a monitor working directory inside a guard folder is denied", async t => {
  const f = fixture(t);
  assert.match((await f.run(f.exact, { cwd: f.data })).deny, PROTECTED);
});

test("typing the monitor into a running shell stays denied", async t => {
  const f = fixture(t);
  assert.match((await f.run(f.exact, { tool: "write_bash" })).deny, /running shell/);
});

test("ordinary writes to the lock file stay denied with a listed monitor", async t => {
  const f = fixture(t);
  for (const c of [`rm -f ${f.lockFile}`, `python3 /tmp/other.py ${f.lockFile}`, `node -e 'require("fs").rmSync("${f.lockFile}")'`]) {
    assert.match((await f.run(c)).deny ?? "", PROTECTED, c);
  }
});

test("malformed owner entries do not allow anything", async t => {
  const f = fixture(t);
  const good = f.config.readOnlyMonitors[0];
  for (const bad of [[{ ...good, sha256: "x" }], [{ ...good, argument: undefined }], [{ ...good, interpreter: undefined }], [{ ...good, interpreter: ["python3", "-I"] }], [{ ...good, interpreter: [] }], "nope", [null]]) {
    f.config.readOnlyMonitors = bad;
    assert.match((await f.run(f.exact)).deny, PROTECTED);
  }
});
