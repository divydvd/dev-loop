import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

test("the maintained source matches its release integrity manifest", () => {
  const manifest = path.join(root, "SOURCE.sha256");
  assert.ok(fs.existsSync(manifest), "the source integrity manifest is missing");
  const entries = fs.readFileSync(manifest, "utf8").trim().split("\n");
  assert.ok(entries.length >= 9);
  for (const entry of entries) {
    const [, want, name] = entry.match(/^([a-f0-9]{64}) {2}((?:lib\/)?[\w-]+\.mjs)$/) || [];
    assert.ok(name, `invalid manifest entry: ${entry}`);
    const bytes = fs.readFileSync(path.join(root, name));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), want, name);
  }
});

test("validation evidence cannot grant merge approval", async () => {
  const { emptyLedger } = await import("./lib/store.mjs");
  const { recordEvidence, unitFacts } = await import("./lib/units.mjs");
  const data = emptyLedger();
  const sha = "a".repeat(40);
  recordEvidence(data, {
    repo: "example/project", pr: 1, kind: "validated", sha,
    text: "node --test: passed", now: new Date("2026-10-30T00:00:00Z"),
  });
  const facts = unitFacts(data, "example/project", 1, sha);
  assert.equal(facts.validated.length, 1);
  assert.equal(facts.approval, null);
  assert.throws(() => recordEvidence(data, {
    repo: "example/project", pr: 1, kind: "merge", sha, text: "approve",
  }), /kind must be/);
});

test("genuine deployment and history rewrite commands remain classified", async () => {
  const { classify } = await import("./lib/classify.mjs");
  for (const [command, rule, target] of [
    ["firebase deploy", "deploy", "firebase"],
    ["./gradlew :app:publishReleaseBundle", "deploy", "play"],
    ["git push --force origin feature", "force-push", undefined],
    ["git commit --amend", "amend", undefined],
  ]) {
    const { findings } = classify(command, { cwd: "/synthetic/project" });
    assert.ok(findings.some((f) => f.rule === rule && (!target || f.target === target)), command);
  }
});

test("only unquoted owner text can create the existing global control plan", async () => {
  const { cleanOwnerText, planOwnerMessage } = await import("./lib/grants.mjs");
  assert.equal(planOwnerMessage(cleanOwnerText("guards off")).guards, "off");
  assert.equal(planOwnerMessage(cleanOwnerText("> guards off")).guards, null);
  assert.equal(planOwnerMessage(cleanOwnerText("`guards off`")).guards, null);
});

test("passing evidence becomes stale at a different head commit", async () => {
  const { emptyLedger } = await import("./lib/store.mjs");
  const { recordEvidence, unitFacts } = await import("./lib/units.mjs");
  const data = emptyLedger();
  recordEvidence(data, {
    repo: "example/project", pr: 2, kind: "validated", sha: "a".repeat(40), text: "passed",
  });
  assert.equal(unitFacts(data, "example/project", 2, "b".repeat(40)).validated.length, 0);
});

test("separate ledger instances share committed state in a disposable directory", async (t) => {
  const { Ledger } = await import("./lib/store.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "work-ledger-baseline-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = new Ledger(dir);
  const second = new Ledger(dir);
  first.update((data) => { data.pending.push({ kind: "deploy", at: new Date().toISOString() }); });
  assert.equal(second.read().pending[0].kind, "deploy");
  assert.equal(fs.existsSync(path.join(dir, "ledger.lock.d")), false);
});
