import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  analyzeSessions,
  classifyRoute,
  collectMetrics,
  computeCodeSurvival,
  detectFixups,
  fetchMergedPrs,
  formatMarkdownReport,
  isProductionPath,
  mergeIntervals,
  parseSessionEvents,
  verifyPrEvidence,
} from "./collect-metrics.mjs";

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `dev-loop-${prefix}-`));
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initGitRepo() {
  const dir = makeTempDir("git");
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Test User"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# Example\n");
  writeFileSync(join(dir, "src/base.js"), "export const base = 1;\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "initial"]);
  return dir;
}

test("T1: isProductionPath excludes tests, docs, lockfiles, hashes, and generated files", () => {
  assert.equal(isProductionPath("scripts/collect-metrics.mjs"), true);
  assert.equal(isProductionPath("src/app/feature.kt"), true);
  assert.equal(isProductionPath("com.github.copilot/rules/core.mdc"), false);
  assert.equal(isProductionPath("skills/infra-review/SKILL.md"), false);
  assert.equal(isProductionPath("README.md"), false);
  assert.equal(isProductionPath("docs/flows/auth.md"), false);
  assert.equal(isProductionPath("scripts/collect-metrics.test.mjs"), false);
  assert.equal(isProductionPath("app/src/test/java/AuthTest.kt"), false);
  assert.equal(isProductionPath("package-lock.json"), false);
  assert.equal(isProductionPath("tools/work-ledger/SOURCE.sha256"), false);
  assert.equal(isProductionPath("app/schemas/com.example.Db/3.json"), false);
});

test("T1: classifyRoute buckets PRs into trivial, small, and multi-task", () => {
  assert.equal(
    classifyRoute({
      files: [{ path: "README.md", additions: 10, deletions: 2 }],
    }),
    "trivial",
  );
  assert.equal(
    classifyRoute({
      files: [
        { path: "src/parser.js", additions: 45, deletions: 10 },
        { path: "src/parser.test.js", additions: 90, deletions: 0 },
      ],
    }),
    "small",
  );
  assert.equal(
    classifyRoute({
      files: [{ path: "src/engine.js", additions: 110, deletions: 35 }],
    }),
    "multi-task",
  );
  assert.equal(
    classifyRoute({
      body: "Plan with 5 tasks:\n### Task 1\n### Task 2\n### Task 3\n### Task 4\n### Task 5",
      files: [{ path: "src/small-diff.js", additions: 30, deletions: 5 }],
    }),
    "multi-task",
  );
});

test("T2: computeCodeSurvival tracks surviving production lines across edits, file deletions, merges, and zero-add PRs", () => {
  const dir = initGitRepo();
  try {
    // PR 1 (squash commit on main): adds 10 prod lines in feature.js, 6 prod lines in doomed.js, 4 doc lines
    const featureLines = Array.from({ length: 10 }, (_, i) => `export const f${i} = ${i};`).join("\n") + "\n";
    const doomedLines = Array.from({ length: 6 }, (_, i) => `export const d${i} = ${i};`).join("\n") + "\n";
    writeFileSync(join(dir, "src/feature.js"), featureLines);
    writeFileSync(join(dir, "src/doomed.js"), doomedLines);
    writeFileSync(join(dir, "docs/guide.md"), "a\nb\nc\nd\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: add feature (#1)"]);
    const pr1MergeSha = git(dir, ["rev-parse", "HEAD"]);

    // PR 2: pure deletion in src/base.js (0 added production lines -> rate null, no NaN)
    writeFileSync(join(dir, "src/base.js"), "");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "chore: remove old base (#2)"]);
    const pr2MergeSha = git(dir, ["rev-parse", "HEAD"]);

    // PR 3: 2-commit non-fast-forward merge branch adding 4 prod lines
    git(dir, ["checkout", "-b", "feat-branch"]);
    writeFileSync(join(dir, "src/branch.js"), "const b1 = 1;\nconst b2 = 2;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "branch part 1"]);
    writeFileSync(join(dir, "src/branch.js"), "const b1 = 1;\nconst b2 = 2;\nconst b3 = 3;\nconst b4 = 4;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "branch part 2"]);
    git(dir, ["checkout", "main"]);
    git(dir, ["merge", "--no-ff", "feat-branch", "-m", "Merge PR #3"]);
    const pr3MergeSha = git(dir, ["rev-parse", "HEAD"]);

    // Later churn on main: modify 3 lines + delete 1 line in feature.js (leaving 6/10), delete doomed.js (leaving 0/6), rewrite docs
    const updatedFeature = [
      "export const f0 = 999;",
      "export const f1 = 999;",
      "export const f2 = 999;",
      // f3 deleted
      "export const f4 = 4;",
      "export const f5 = 5;",
      "export const f6 = 6;",
      "export const f7 = 7;",
      "export const f8 = 8;",
      "export const f9 = 9;",
    ].join("\n") + "\n";
    writeFileSync(join(dir, "src/feature.js"), updatedFeature);
    rmSync(join(dir, "src/doomed.js"));
    writeFileSync(join(dir, "docs/guide.md"), "rewritten\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-m", "fix: adjust feature"]);
    const targetSha = git(dir, ["rev-parse", "HEAD"]);

    const res = computeCodeSurvival(
      [
        { number: 1, mergeCommit: { oid: pr1MergeSha } },
        { number: 2, mergeCommit: { oid: pr2MergeSha } },
        { number: 3, mergeCommit: { oid: pr3MergeSha } },
      ],
      { checkoutDir: dir, targetRef: targetSha },
    );

    assert.equal(res.addedLines, 20); // 16 from PR1 + 0 from PR2 + 4 from PR3
    assert.equal(res.survivingLines, 10); // 6 from PR1 + 0 from PR2 + 4 from PR3
    assert.equal(res.rate, 0.5);

    const p1 = res.perPr.find((p) => p.number === 1);
    const p2 = res.perPr.find((p) => p.number === 2);
    const p3 = res.perPr.find((p) => p.number === 3);
    assert.deepEqual({ added: p1.addedLines, survived: p1.survivingLines, rate: p1.rate }, { added: 16, survived: 6, rate: 6 / 16 });
    assert.deepEqual({ added: p2.addedLines, survived: p2.survivingLines, rate: p2.rate }, { added: 0, survived: 0, rate: null });
    assert.deepEqual({ added: p3.addedLines, survived: p3.survivingLines, rate: p3.rate }, { added: 4, survived: 4, rate: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T3: detectFixups catches 14-day explicit fix/revert refs and bug-fix blame churn while ignoring >14d and features", () => {
  const dir = initGitRepo();
  try {
    writeFileSync(join(dir, "src/auth.js"), "export function login(u) {\n  return u.token;\n}\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: add login (#10)"]);
    const sha10 = git(dir, ["rev-parse", "HEAD"]);

    // PR 11: explicit reference within 14 days
    writeFileSync(join(dir, "src/other.js"), "export const ok = true;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "fix: config after #10 (#11)"]);
    const sha11 = git(dir, ["rev-parse", "HEAD"]);

    // PR 12: bug fix within 14 days that rewrites PR 10's line without naming #10
    writeFileSync(join(dir, "src/auth.js"), "export function login(u) {\n  return u?.token ?? null;\n}\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "fix: guard null user token (#12)"]);
    const sha12 = git(dir, ["rev-parse", "HEAD"]);

    // PR 13: feature touching auth.js whose body has dev-loop PR template boilerplate ("Regression selection", "Fixed findings") + mentions #10
    writeFileSync(join(dir, "src/auth.js"), "export function login(u) {\n  return u?.token ?? null;\n}\nexport const v = 2;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: export auth version (#13)"]);
    const sha13 = git(dir, ["rev-parse", "HEAD"]);

    // PR 14: explicit reference 20 days after PR 10 (> 14d window)
    writeFileSync(join(dir, "src/late.js"), "export const late = 1;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "fix: old edge case from #10 (#14)"]);
    const sha14 = git(dir, ["rev-parse", "HEAD"]);

    const prs = [
      { number: 10, title: "feat: add login", body: "", mergedAt: "2026-11-01T10:00:00Z", mergeCommit: { oid: sha10 } },
      { number: 11, title: "fix: post-merge config", body: "Fixes regression introduced by #10. Also fixes #10.", mergedAt: "2026-11-04T10:00:00Z", mergeCommit: { oid: sha11 } },
      { number: 12, title: "fix: guard null user token", body: "Null check.", mergedAt: "2026-11-06T10:00:00Z", mergeCommit: { oid: sha12 } },
      { number: 13, title: "Improve auth version export", body: "- Regression selection: reuse CI.\n- Fixed findings: None.\nPreserves merged #10.", mergedAt: "2026-11-07T10:00:00Z", mergeCommit: { oid: sha13 } },
      { number: 14, title: "fix: old edge case", body: "Fixes #10.", mergedAt: "2026-11-22T10:00:00Z", mergeCommit: { oid: sha14 } },
    ];

    const fixups = detectFixups(prs, { checkoutDir: dir, windowDays: 14 });
    assert.deepEqual(fixups.fixupPrNumbers, [11, 12]);
    assert.deepEqual(fixups.regressedPrNumbers, [10]);
    assert.equal(fixups.details.length, 2, "must deduplicate repeated refs and ignore PR template boilerplate");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T4: verifyPrEvidence accepts exact SHA and docs-only ancestors, rejects untested prod commits, and handles missing ledger", () => {
  const dir = initGitRepo();
  try {
    writeFileSync(join(dir, "src/calc.js"), "export const x = 1;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "code change"]);
    const testedSha = git(dir, ["rev-parse", "HEAD"]);

    // Docs-only child commit
    writeFileSync(join(dir, "docs/calc.md"), "# Calc\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "docs update"]);
    const docsChildSha = git(dir, ["rev-parse", "HEAD"]);

    // Untested production child commit
    writeFileSync(join(dir, "src/calc.js"), "export const x = 2;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "untested prod tweak"]);
    const prodChildSha = git(dir, ["rev-parse", "HEAD"]);

    const ledgerData = {
      units: {
        "org/app#21": {
          repo: "org/app",
          pr: 21,
          evidence: [{ kind: "validated", sha: testedSha, text: "npm test pass" }],
        },
      },
      validations: [{ sha: testedSha, exit: 0, dirty: false, tasks: "test" }],
    };

    const prodFiles = [{ path: "src/calc.js", additions: 1, deletions: 0 }];

    const exact = verifyPrEvidence(
      { number: 21, headRefOid: testedSha, files: prodFiles },
      { repo: "org/app", ledgerData, checkoutDir: dir },
    );
    assert.equal(exact.verified, true);
    assert.equal(exact.status, "verified_head");

    const docsOnly = verifyPrEvidence(
      { number: 22, headRefOid: docsChildSha, files: [...prodFiles, { path: "docs/calc.md", additions: 1, deletions: 0 }] },
      { repo: "org/app", ledgerData, checkoutDir: dir },
    );
    assert.equal(docsOnly.verified, true);
    assert.equal(docsOnly.status, "verified_ancestry_docs_only");
    assert.equal(docsOnly.testedSha, testedSha);

    const untestedProd = verifyPrEvidence(
      { number: 23, headRefOid: prodChildSha, files: prodFiles },
      { repo: "org/app", ledgerData, checkoutDir: dir },
    );
    assert.equal(untestedProd.verified, false);
    assert.equal(untestedProd.status, "unverified_prod_after_test");

    const trivialDocs = verifyPrEvidence(
      { number: 24, headRefOid: prodChildSha, files: [{ path: "README.md", additions: 2, deletions: 0 }] },
      { repo: "org/app", ledgerData: null, checkoutDir: dir },
    );
    assert.equal(trivialDocs.verified, true);
    assert.equal(trivialDocs.status, "exempt_no_prod_code");

    const missingLedger = verifyPrEvidence(
      { number: 25, headRefOid: prodChildSha, files: prodFiles },
      { repo: "org/app", ledgerData: null, checkoutDir: dir },
    );
    assert.equal(missingLedger.verified, null);
    assert.equal(missingLedger.status, "unavailable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T5 & T6: analyzeSessions handles cumulative totalNanoAiu, edit-aware duplicate reads, shared-session ambiguity, steering filter, and truncated JSONL", () => {
  const sessionsDir = makeTempDir("sessions");
  try {
    // Session 1: uniquely maps to PR #31
    const s1 = join(sessionsDir, "sess-1");
    mkdirSync(s1, { recursive: true });
    writeFileSync(
      join(s1, "workspace.yaml"),
      "id: sess-1\nrepository: org/app\ncreated_at: 2026-11-10T08:00:00Z\n",
    );
    const s1Events = [
      JSON.stringify({ type: "user.message", data: { content: "Implement small parser fix" } }), // kickoff (ignored)
      JSON.stringify({ type: "assistant.turn_start", data: { turnId: "1" } }),
      JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "c1", toolName: "view", arguments: { path: "/w/src/a.js" } } }),
      JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "c1", success: true, result: { content: "x".repeat(100) } } }),
      JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "c2", toolName: "view", arguments: { path: "/w/src/a.js" } } }),
      JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "c2", success: true, result: { content: "x".repeat(100) } } }), // duplicate 100
      JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "c3", toolName: "edit", arguments: { path: "/w/src/a.js" } } }),
      JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "c3", success: true, result: { content: "edited" } } }),
      JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "c4", toolName: "view", arguments: { path: "/w/src/a.js" } } }),
      JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "c4", success: true, result: { content: "y".repeat(120) } } }), // post-edit, NOT duplicate
      JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "c5", toolName: "view", arguments: { path: "/w/src/b.js", view_range: [1, 50] } } }),
      JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "c5", success: true, result: { content: "z".repeat(40) } } }),
      JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "c6", toolName: "view", arguments: { path: "/w/src/b.js", view_range: [51, 100] } } }),
      JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "c6", success: true, result: { content: "w".repeat(40) } } }), // disjoint chunk -> NOT duplicate!
      JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 100000 } }),
      JSON.stringify({ type: "user.message", agentId: "sub-1", data: { content: "Keep small PRs and run device test" } }), // subagent (ignored)
      JSON.stringify({ type: "user.message", data: { source: "agent-other-session", content: "Please check independent review and small PRs" } }), // data.source agent (ignored!)
      JSON.stringify({ type: "user.message", data: { source: "system", content: "System reminder: run device test" } }), // data.source system (ignored!)
      JSON.stringify({ type: "user.message", data: { content: "<skill-context name=\"dev-loop\">keep small PRs</skill-context>" } }), // skill injection (ignored)
      JSON.stringify({ type: "user.message", data: { content: "Please run the device test before you report done" } }), // owner repeat rule (counted!)
      JSON.stringify({ type: "user.message", data: { content: "merge #31" } }), // approval (ignored)
      JSON.stringify({ type: "assistant.message", data: { content: "Opened https://github.com/org/app/pull/31" } }),
      JSON.stringify({ type: "session.compaction_start", data: {} }),
      JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 250000 } }),
      JSON.stringify({ type: "session.shutdown", data: { totalNanoAiu: null } }), // null shutdown must NOT overwrite 250000 with 0!
      '{"type":"assistant.turn_start","data":{"truncated":', // malformed trailing line from live writer
    ];
    writeFileSync(join(s1, "events.jsonl"), s1Events.join("\n"));

    // Session 2: shared coordinator-started session mapped to both PR #32 and PR #33, with 2 owner repeat-rule messages
    const s2 = join(sessionsDir, "sess-shared");
    mkdirSync(s2, { recursive: true });
    writeFileSync(
      join(s2, "workspace.yaml"),
      "id: sess-shared\nrepository: org/app\ncreated_at: 2026-11-10T09:00:00Z\n",
    );
    writeFileSync(
      join(s2, "events.jsonl"),
      [
        JSON.stringify({ type: "user.message", data: { source: "agent-parent", content: "Coordinated child kickoff" } }), // counts as kickoff!
        JSON.stringify({ type: "user.message", data: { content: "Remember small PRs" } }), // repeat #1
        JSON.stringify({ type: "user.message", data: { content: "Also run device test" } }), // repeat #2
        JSON.stringify({ type: "assistant.turn_start", data: { turnId: "1" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "Tracking https://github.com/org/app/pull/32 and https://github.com/org/app/pull/33" } }),
        JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 900000 } }),
      ].join("\n") + "\n",
    );

    const prs = [
      { number: 3, url: "https://github.com/org/app/pull/3", mergedAt: "2026-11-11T09:30:00Z" }, // prefix of /pull/31!
      { number: 31, url: "https://github.com/org/app/pull/31", mergedAt: "2026-11-11T10:00:00Z" },
      { number: 32, url: "https://github.com/org/app/pull/32", mergedAt: "2026-11-11T11:00:00Z" },
      { number: 33, url: "https://github.com/org/app/pull/33", mergedAt: "2026-11-11T12:00:00Z" },
    ];

    const out = analyzeSessions(prs, { sessionsDir, repo: "org/app" });
    assert.equal(out.perPr[3].attribution, "unmatched", "PR #3 must not match /pull/31");
    const p31 = out.perPr[31];
    assert.equal(p31.attribution, "unique");
    assert.equal(p31.totalNanoAiu, 250000); // latest checkpoint, NOT 350000 and NOT overwritten by null shutdown
    assert.equal(p31.modelCalls, 2); // 1 turn_start + 1 compaction_start
    assert.equal(p31.totalReadChars, 400);
    assert.equal(p31.duplicateReadChars, 100);
    assert.equal(p31.duplicateReadRate, 0.25);
    assert.equal(p31.ownerRepeatMessages, 1);

    assert.equal(out.perPr[32].attribution, "ambiguous");
    assert.equal(out.perPr[32].sharedSession, true);
    assert.equal(out.perPr[33].attribution, "ambiguous");
    assert.deepEqual(out.sharedPrNumbers, [32, 33]);
    assert.equal(out.totalOwnerRepeatMessages, 3, "counts s1 (1) + sess-shared (2) once without dropping shared session");
  } finally {
    rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test("T6 & T7: collectMetrics and CLI compute route medians, firstPushGreenRate, durableFirstPassYield, and n/a fallbacks", () => {
  const root = makeTempDir("cli");
  const gitDir = initGitRepo();
  try {
    writeFileSync(join(gitDir, "src/trim.js"), "export const t = (s) => s.trim();\n");
    git(gitDir, ["add", "."]);
    git(gitDir, ["commit", "-m", "fix: trim input (#1)"]);
    const sha1 = git(gitDir, ["rev-parse", "HEAD"]);
    writeFileSync(join(gitDir, "README.md"), "# Example\nUpdated\n");
    git(gitDir, ["add", "."]);
    git(gitDir, ["commit", "-m", "docs: update readme (#2)"]);
    const sha2 = git(gitDir, ["rev-parse", "HEAD"]);

    const prsPath = join(root, "prs.json");
    const prs = [
      {
        number: 1,
        title: "fix: trim input",
        body: "",
        url: "https://github.com/org/app/pull/1",
        createdAt: "2026-11-10T10:00:00Z",
        mergedAt: "2026-11-10T11:00:00Z",
        headRefOid: sha1,
        mergeCommit: { oid: sha1 },
        files: [{ path: "src/trim.js", additions: 1, deletions: 0 }],
        commits: [{ committedDate: "2026-11-10T09:58:00Z" }], // 0 post-open commits -> first-push green!
      },
      {
        number: 2,
        title: "docs: update readme",
        body: "",
        url: "https://github.com/org/app/pull/2",
        createdAt: "2026-11-11T10:00:00Z",
        mergedAt: "2026-11-11T12:00:00Z",
        headRefOid: sha2,
        mergeCommit: { oid: sha2 },
        files: [{ path: "README.md", additions: 5, deletions: 1 }],
        commits: [
          { committedDate: "2026-11-11T09:55:00Z" },
          { committedDate: "2026-11-11T10:30:00Z" }, // 1 post-open fix commit
        ],
      },
    ];
    writeFileSync(prsPath, JSON.stringify(prs));

    const ledgerDir = join(root, "ledger");
    mkdirSync(ledgerDir, { recursive: true });
    writeFileSync(
      join(ledgerDir, "ledger.json"),
      JSON.stringify({
        v: 1,
        units: {},
        validations: [{ sha: sha1, exit: 0, dirty: false, tasks: "test" }],
      }),
    );

    const sessionsDir = join(root, "sessions");
    const s1 = join(sessionsDir, "s1");
    mkdirSync(s1, { recursive: true });
    writeFileSync(join(s1, "workspace.yaml"), "id: s1\nrepository: org/app\ncreated_at: 2026-11-10T09:00:00Z\n");
    writeFileSync(
      join(s1, "events.jsonl"),
      [
        JSON.stringify({ type: "user.message", data: { content: "Trim input whitespace" } }),
        JSON.stringify({ type: "assistant.turn_start", data: { turnId: "1" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "https://github.com/org/app/pull/1" } }),
        JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 140000 } }),
      ].join("\n") + "\n",
    );

    const report = collectMetrics({
      repo: "org/app",
      prs,
      from: "2026-11-08T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      ledgerDir,
      sessionsDir,
      checkoutDir: gitDir,
    });

    assert.equal(report.mergedPrCount, 2);
    assert.equal(report.autonomy.firstPushGreenCount, 1);
    assert.equal(report.autonomy.firstPushGreenRate, 0.5);
    assert.equal(report.verification.verifiedCount, 2); // #1 exact SHA, #2 exempt_no_prod_code
    assert.equal(report.verification.rate, 1);
    assert.equal(report.durableFirstPassYield.passedCount, 1); // only #1 has attributed session; #2 is unmatched (not estimated!)
    assert.equal(report.durableFirstPassYield.eligibleCount, 1);
    assert.equal(report.durableFirstPassYield.rate, 1);
    assert.equal(report.routeBuckets.small.count, 1);
    assert.equal(report.routeBuckets.small.medianNanoAiu, 140000);

    // Without checkoutDir, blame_churn cannot be checked, so fixupStatus and durableFirstPassYield report blame_unavailable
    const noGitReport = collectMetrics({
      repo: "org/app",
      prs,
      from: "2026-11-08T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      ledgerDir,
      sessionsDir,
      checkoutDir: null,
    });
    assert.equal(noGitReport.durability.fixupStatus, "blame_unavailable");
    assert.equal(noGitReport.durableFirstPassYield.status, "blame_unavailable");
    assert.equal(noGitReport.durableFirstPassYield.rate, null);
    assert.equal(noGitReport.durability.codeSurvival.rate, null);

    const md = formatMarkdownReport(noGitReport);
    assert.match(md, /Code survival rate \(14d\).*n\/a/);
    assert.match(md, /Fix-up PRs \(14d, ref \+ blame\).*n\/a \(blame_unavailable/);
    assert.match(md, /First-push green rate.*1\/2 \(50\.0%\)/);

    // CLI invocation with absent optional dirs
    const cliJson = execFileSync(
      process.execPath,
      [
        "scripts/collect-metrics.mjs",
        "--repo",
        "org/app",
        "--prs-file",
        prsPath,
        "--from",
        "2026-11-08T00:00:00Z",
        "--to",
        "2026-11-13T00:00:00Z",
        "--ledger-dir",
        join(root, "does-not-exist"),
        "--sessions-dir",
        join(root, "does-not-exist-2"),
        "--format",
        "json",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const parsed = JSON.parse(cliJson);
    assert.equal(parsed.mergedPrCount, 2);
    assert.equal(parsed.verification.status, "unavailable");

    const cliMd = execFileSync(
      process.execPath,
      [
        "scripts/collect-metrics.mjs",
        "--repo",
        "org/app",
        "--prs-file",
        prsPath,
        "--from",
        "2026-11-08T00:00:00Z",
        "--to",
        "2026-11-13T00:00:00Z",
        "--ledger-dir",
        join(root, "does-not-exist"),
        "--sessions-dir",
        join(root, "does-not-exist-2"),
        "--format",
        "markdown",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.match(cliMd, /n\/a/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(gitDir, { recursive: true, force: true });
  }
});

test("T8: fetchMergedPrs uses bounded GraphQL without authors and normalizes nested files and commits", () => {
  const calls = [];
  const fakeExec = (cmd, args) => {
    calls.push({ cmd, args });
    return JSON.stringify({
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 34,
                title: "Improve failure classification",
                url: "https://github.com/divydvd/dev-loop/pull/34",
                body: "",
                createdAt: "2026-11-11T13:46:07Z",
                mergedAt: "2026-11-13T08:49:15Z",
                headRefOid: "ae86c9d",
                mergeCommit: { oid: "1234567" },
                files: { nodes: [{ path: "skills/infra-review/SKILL.md", additions: 20, deletions: 2 }] },
                commits: { nodes: [{ commit: { committedDate: "2026-11-11T13:44:26Z" } }] },
              },
            ],
          },
        },
      },
    });
  };

  const prs = fetchMergedPrs("divydvd/dev-loop", { execFn: fakeExec });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "gh");
  assert.equal(calls[0].args[0], "api");
  assert.equal(calls[0].args[1], "graphql");
  assert.ok(!calls[0].args.includes("-F"), "must use -f raw string fields, not -F typed coercion");
  assert.ok(calls[0].args.join(" ").includes("commits(last:50)"), "must fetch newest commits");
  assert.ok(!calls[0].args.join(" ").includes("authors"), "must not query authors connection");
  assert.equal(prs.length, 1);
  assert.deepEqual(prs[0].files, [{ path: "skills/infra-review/SKILL.md", additions: 20, deletions: 2 }]);
  assert.deepEqual(prs[0].commits, [{ committedDate: "2026-11-11T13:44:26Z" }]);
});

test("T9: review regressions — renames, bounded mature cohort, post-window fixups, repo#N reverts, truncated files, and invalid SHAs", () => {
  const dir = initGitRepo();
  try {
    // Old PR #1 (40 days before to -> outside [from - 14d, to - 14d) cohort!)
    writeFileSync(join(dir, "src/ancient.js"), "export const old1 = 1;\nexport const old2 = 2;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: ancient (#1)"]);
    const sha1 = git(dir, ["rev-parse", "HEAD"]);

    // Mature PR #2 (16 days before to -> inside [from - 14d, to - 14d) cohort!): adds 3 lines in src/renameme.js
    writeFileSync(join(dir, "src/renameme.js"), "export const r1 = 1;\nexport const r2 = 2;\nexport const r3 = 3;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: renameme (#2)"]);
    const sha2 = git(dir, ["rev-parse", "HEAD"]);

    // In-window PR #3: renames src/renameme.js -> src/renamed.js and modifies 1 line (2 of 3 lines from PR #2 survive!)
    git(dir, ["mv", "src/renameme.js", "src/renamed.js"]);
    writeFileSync(join(dir, "src/renamed.js"), "export const r1 = 100;\nexport const r2 = 2;\nexport const r3 = 3;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "refactor: rename file (#3)"]);
    const sha3 = git(dir, ["rev-parse", "HEAD"]);

    // Post-window PR #4 (merged AFTER `to`): Reverts org/app#3 — must NOT count inside [from, to) report!
    writeFileSync(join(dir, "src/after.js"), "export const a = 1;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "revert (#4)"]);
    const sha4 = git(dir, ["rev-parse", "HEAD"]);

    const allPrs = [
      { number: 1, title: "feat: ancient", body: "", mergedAt: "2026-10-01T10:00:00Z", headRefOid: sha1, mergeCommit: { oid: sha1 }, files: [{ path: "src/ancient.js", additions: 2, deletions: 0 }] },
      { number: 2, title: "feat: renameme", body: "", mergedAt: "2026-10-28T10:00:00Z", headRefOid: sha2, mergeCommit: { oid: sha2 }, files: [{ path: "src/renameme.js", additions: 3, deletions: 0 }] },
      { number: 3, title: "refactor: rename", body: "", mergedAt: "2026-11-10T10:00:00Z", headRefOid: sha3, mergeCommit: { oid: sha3 }, files: [{ path: "src/renamed.js", additions: 1, deletions: 1 }] },
      { number: 4, title: "Revert \"refactor: rename\"", body: "Reverts org/app#3 and fixes https://github.com/org/app/pull/3", mergedAt: "2026-11-15T10:00:00Z", headRefOid: sha4, mergeCommit: { oid: sha4 }, files: [{ path: "src/after.js", additions: 1, deletions: 0 }] },
    ];

    // Direct detectFixups catches Reverts org/app#3 and PR URL when #4 is in scope
    const fullFixups = detectFixups(allPrs, { checkoutDir: dir, windowDays: 14 });
    assert.deepEqual(fullFixups.fixupPrNumbers, [4]);
    assert.equal(fullFixups.details.length, 1);

    // Windowed collectMetrics [2026-11-06, 2026-11-13) excludes #1 from mature cohort and excludes post-to #4!
    const rep = collectMetrics({
      repo: "org/app",
      prs: allPrs,
      from: "2026-11-06T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      checkoutDir: dir,
      targetRef: sha3,
    });
    assert.equal(rep.durability.codeSurvival.addedLines, 3, "only PR #2 is in [from-14d, to-14d), not ancient PR #1");
    assert.equal(rep.durability.codeSurvival.survivingLines, 2, "follows rename src/renameme.js -> src/renamed.js");
    assert.equal(rep.durability.fixupPrCount, 0, "post-to PR #4 excluded");

    // Truncated files list must NOT be classified trivial or exempt_no_prod_code
    assert.equal(classifyRoute({ files: [{ path: "README.md", additions: 2, deletions: 0 }], filesTruncated: true }), "multi-task");
    const truncEv = verifyPrEvidence(
      { number: 90, headRefOid: sha3, files: [{ path: "README.md", additions: 2, deletions: 0 }], filesTruncated: true },
      { repo: "org/app", ledgerData: { units: {}, validations: [] }, checkoutDir: dir },
    );
    assert.equal(truncEv.verified, false);

    // Invalid flag-like headRefOid rejected safely; missing local SHA gets distinct unverified status
    const badSha = verifyPrEvidence(
      { number: 91, headRefOid: "--all", files: [{ path: "src/renamed.js", additions: 1, deletions: 0 }] },
      { repo: "org/app", ledgerData: { units: {}, validations: [] }, checkoutDir: dir },
    );
    assert.equal(badSha.verified, false);
    assert.equal(badSha.status, "invalid_head_sha");

    const missingLocal = verifyPrEvidence(
      { number: 92, headRefOid: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", files: [{ path: "src/renamed.js", additions: 1, deletions: 0 }] },
      { repo: "org/app", ledgerData: { units: {}, validations: [] }, checkoutDir: dir },
    );
    assert.equal(missingLocal.verified, false);
    assert.equal(missingLocal.status, "unverified_head_missing_locally");

    // Accurate Markdown n/a labels on empty window and commit_missing mature PR
    const emptyMd = formatMarkdownReport(collectMetrics({ repo: "org/app", prs: [] }));
    assert.doesNotMatch(emptyMd, /n\/a \(ok\)/);
    assert.match(emptyMd, /n\/a \(no_prs\)/);

    const missingMatureMd = formatMarkdownReport(
      collectMetrics({
        repo: "org/app",
        prs: [{ number: 99, mergedAt: "2026-10-28T10:00:00Z", mergeCommit: { oid: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }, files: [{ path: "src/x.js", additions: 5, deletions: 0 }] }],
        from: "2026-11-06T00:00:00Z",
        to: "2026-11-13T00:00:00Z",
        checkoutDir: dir,
        targetRef: sha3,
      }),
    );
    assert.match(missingMatureMd, /n\/a \(commit_missing\)/);

    // Shared session with 0 repeat reminders must still be excluded from durableFirstPassYield.eligibleCount (no selection bias!)
    const zeroRepeatSharedDir = makeTempDir("zero-shared");
    try {
      const zs = join(zeroRepeatSharedDir, "s-shared");
      mkdirSync(zs, { recursive: true });
      writeFileSync(join(zs, "workspace.yaml"), "id: s-shared\nrepository: org/app\ncreated_at: 2026-11-09T00:00:00Z\n");
      writeFileSync(
        join(zs, "events.jsonl"),
        JSON.stringify({ type: "assistant.message", data: { content: "https://github.com/org/app/pull/50 and https://github.com/org/app/pull/51" } }) + "\n",
      );
      const biasCheck = collectMetrics({
        repo: "org/app",
        prs: [
          { number: 50, url: "https://github.com/org/app/pull/50", mergedAt: "2026-11-10T10:00:00Z", headRefOid: sha3, files: [{ path: "README.md", additions: 1, deletions: 0 }] },
          { number: 51, url: "https://github.com/org/app/pull/51", mergedAt: "2026-11-10T11:00:00Z", headRefOid: sha3, files: [{ path: "README.md", additions: 1, deletions: 0 }] },
        ],
        from: "2026-11-06T00:00:00Z",
        to: "2026-11-13T00:00:00Z",
        sessionsDir: zeroRepeatSharedDir,
      });
      assert.equal(biasCheck.durableFirstPassYield.eligibleCount, 0);
      assert.equal(biasCheck.durableFirstPassYield.status, "no_attributed_sessions");
    } finally {
      rmSync(zeroRepeatSharedDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T10: Copilot review regressions — mixed commit_missing cohort, missing repo workspace, deduplicated shared-session cost, cross-window shared session, and truncated PR pagination", () => {
  const dir = initGitRepo();
  const sessionsDir = makeTempDir("sessions-r10");
  try {
    writeFileSync(join(dir, "src/present.js"), "export const p = 1;\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: present (#1)"]);
    const sha1 = git(dir, ["rev-parse", "HEAD"]);

    // 1. Mixed mature cohort: PR #1 present (1 added surviving line) + PR #2 commit_missing -> aggregate rate MUST be null ("commit_missing"), NOT 1/1 (100%)!
    const mixedSurvival = computeCodeSurvival(
      [
        { number: 1, mergeCommit: { oid: sha1 } },
        { number: 2, mergeCommit: { oid: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" } },
      ],
      { checkoutDir: dir, targetRef: sha1 },
    );
    assert.equal(mixedSurvival.status, "commit_missing");
    assert.equal(mixedSurvival.rate, null);
    assert.equal(mixedSurvival.perPr[0].rate, 1);

    // 2. Session without `repository:` in workspace.yaml must be excluded when `repo` is specified;
    //    cross-window shared session (handling PR #10 before `from`, PR #11 inside `[from, to)`, and PR #12 AFTER `to`) must mark #11 `ambiguous` and surface deduplicated sharedSession summary!
    const sNoRepo = join(sessionsDir, "s-no-repo");
    mkdirSync(sNoRepo, { recursive: true });
    writeFileSync(join(sNoRepo, "workspace.yaml"), "id: s-no-repo\ncreated_at: 2026-11-01T00:00:00Z\n");
    writeFileSync(
      join(sNoRepo, "events.jsonl"),
      [
        JSON.stringify({ type: "assistant.message", data: { content: Array(10).fill("https://github.com/org/app/pull/11").join(" ") } }),
        JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 999999999 } }),
      ].join("\n") + "\n",
    );

    const sCross = join(sessionsDir, "s-cross");
    mkdirSync(sCross, { recursive: true });
    writeFileSync(join(sCross, "workspace.yaml"), "id: s-cross\nrepository: org/app\ncreated_at: 2026-11-01T00:00:00Z\n");
    writeFileSync(
      join(sCross, "events.jsonl"),
      [
        JSON.stringify({ type: "assistant.turn_start", data: { turnId: "1" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "https://github.com/org/app/pull/11 and https://github.com/org/app/pull/12" } }),
        JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 450000 } }),
      ].join("\n") + "\n",
    );

    const crossRep = collectMetrics({
      repo: "org/app",
      prs: [
        // Pre-cohort PR #5 (older than from - 14d) with missing commit must NOT poison fixupStatus!
        { number: 5, title: "feat: very old", mergedAt: "2026-09-01T10:00:00Z", headRefOid: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", mergeCommit: { oid: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }, files: [{ path: "src/old.js", additions: 5, deletions: 0 }] },
        { number: 11, title: "feat: in-window", url: "https://github.com/org/app/pull/11", mergedAt: "2026-11-10T10:00:00Z", headRefOid: sha1, mergeCommit: { oid: sha1 }, files: [{ path: "README.md", additions: 1, deletions: 0 }] },
        { number: 12, title: "feat: post-to-window", url: "https://github.com/org/app/pull/12", mergedAt: "2026-11-14T10:00:00Z", headRefOid: sha1, mergeCommit: { oid: sha1 }, files: [{ path: "README.md", additions: 1, deletions: 0 }] },
      ],
      from: "2026-11-06T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      checkoutDir: dir,
      sessionsDir,
      targetRef: sha1,
    });
    assert.equal(crossRep.durability.fixupStatus, "ok", "ancient pre-cohort PR #5 must not poison fixupStatus");
    assert.deepEqual(crossRep.autonomy.sharedPrNumbers, [11], "in-window PR #11 shares s-cross with post-to PR #12");
    assert.equal(crossRep.durableFirstPassYield.eligibleCount, 0, "cross-to shared session must not be treated as unique");
    assert.equal(crossRep.autonomy.sharedSessions.length, 1);
    assert.equal(crossRep.autonomy.sharedSessions[0].totalNanoAiu, 450000);
    assert.match(formatMarkdownReport(crossRep), /4\.50e\+5/);

    // 3. Truncated PR pagination marks affected metrics `prs_truncated` and suppresses route session medians
    const truncFetch = fetchMergedPrs("org/app", {
      maxPages: 1,
      execFn: () =>
        JSON.stringify({
          data: {
            repository: {
              pullRequests: {
                pageInfo: { hasNextPage: true, endCursor: "c1" },
                nodes: [
                  {
                    number: 11,
                    title: "feat: in-window",
                    url: "https://github.com/org/app/pull/11",
                    body: "",
                    createdAt: "2026-11-10T09:00:00Z",
                    mergedAt: "2026-11-10T10:00:00Z",
                    updatedAt: "2026-11-10T10:00:00Z",
                    headRefOid: sha1,
                    mergeCommit: { oid: sha1 },
                    files: { pageInfo: { hasNextPage: false }, nodes: [{ path: "README.md", additions: 1, deletions: 0 }] },
                    commits: { totalCount: 1, nodes: [{ commit: { committedDate: "2026-11-10T09:00:00Z" } }] },
                  },
                ],
              },
            },
          },
        }),
    });
    assert.equal(truncFetch.truncated, true);
    const truncRep = collectMetrics({
      repo: "org/app",
      prs: truncFetch,
      prsTruncated: truncFetch.truncated,
      from: "2026-11-06T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      checkoutDir: dir,
      sessionsDir,
      targetRef: sha1,
    });
    assert.equal(truncRep.prsTruncated, true);
    assert.equal(truncRep.durability.codeSurvival.status, "prs_truncated");
    assert.equal(truncRep.durability.fixupStatus, "prs_truncated");
    assert.equal(truncRep.durableFirstPassYield.status, "prs_truncated");
    assert.equal(truncRep.durableFirstPassYield.rate, null);
    assert.equal(truncRep.routeBuckets.trivial.medianNanoAiu, null, "truncated PR list must not treat cross-page session as unique");
    assert.match(formatMarkdownReport(truncRep), /First-push green rate \| n\/a \(prs_truncated\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test("T11: Copilot review round-2 regressions — underscore test paths, truncated size medians, repo plan task count, validated-only ledger kind, overlapping view_range lines, and per-line URL session matching", () => {
  const dir = initGitRepo();
  const sessionsDir = makeTempDir("sessions-r11");
  try {
    // 1. Underscore test suffixes excluded from production paths; numbered `### 1. Title` plan headings match while `### 1.1` subsections do not
    assert.equal(isProductionPath("src/parser_test.go"), false);
    assert.equal(isProductionPath("src/parser_test.py"), false);
    assert.equal(isProductionPath("src/parser_spec.rb"), false);
    assert.equal(
      classifyRoute({ body: "### 1. A\n### 2. B\n### 3. C\n### 4. D\n", files: [{ path: "src/a.js", additions: 10, deletions: 0 }] }),
      "multi-task",
    );
    assert.equal(
      classifyRoute({ body: "### 1.1 A\n### 1.2 B\n### 1.3 C\n### 1.4 D\n", files: [{ path: "src/a.js", additions: 10, deletions: 0 }] }),
      "small",
    );

    // 2. Plan file in checkoutDir with 4 tasks classifies a 30-line PR as multi-task even when PR body omits ### Task headings
    mkdirSync(join(dir, "docs/superpowers/plans"), { recursive: true });
    writeFileSync(
      join(dir, "docs/superpowers/plans/2026-11-12-sync.md"),
      "# Plan\n### Task 1: A\n### Task 2: B\n### Task 3: C\n### Task 4: D\n",
    );
    writeFileSync(join(dir, "src/sync.js"), Array.from({ length: 10 }, (_, i) => `export const s${i} = ${i};`).join("\n") + "\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "feat: sync (#60)"]);
    const sha60 = git(dir, ["rev-parse", "HEAD"]);

    assert.equal(
      classifyRoute(
        {
          body: "Copied acceptance record only.",
          headRefOid: sha60,
          mergeCommit: { oid: sha60 },
          files: [
            { path: "docs/superpowers/plans/2026-11-12-sync.md", additions: 5, deletions: 0 },
            { path: "src/sync.js", additions: 10, deletions: 0 },
          ],
        },
        { checkoutDir: dir },
      ),
      "multi-task",
    );

    // 3. `device_tested` alone without `validated` or passing `validations` does NOT verify head
    const deviceOnly = verifyPrEvidence(
      { number: 60, headRefOid: sha60, files: [{ path: "src/sync.js", additions: 10, deletions: 0 }] },
      {
        repo: "org/app",
        checkoutDir: dir,
        ledgerData: {
          units: { "org/app#60": { repo: "org/app", pr: 60, evidence: [{ kind: "device_tested", sha: sha60, text: "adb pass" }] } },
          validations: [],
        },
      },
    );
    assert.equal(deviceOnly.verified, false);

    // 4. Overlapping view_range ([1, 4] then [2, 3], and [1, 2] then full) + per-JSONL-line URL matching
    const sSpam = join(sessionsDir, "s-spam-one-line");
    mkdirSync(sSpam, { recursive: true });
    writeFileSync(join(sSpam, "workspace.yaml"), "id: s-spam-one-line\nrepository: org/app\ncreated_at: 2026-11-10T00:00:00Z\n");
    writeFileSync(
      join(sSpam, "events.jsonl"),
      [
        // Single JSONL line repeating the URL 5 times -> counts as 1 line, NOT 5!
        JSON.stringify({ type: "assistant.message", data: { content: Array(5).fill("https://github.com/org/app/pull/60").join(" ") } }),
        JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 999999 } }),
      ].join("\n") + "\n",
    );

    const sReal = join(sessionsDir, "s-real-three-lines");
    mkdirSync(sReal, { recursive: true });
    writeFileSync(join(sReal, "workspace.yaml"), "id: s-real-three-lines\nrepository: org/app\ncreated_at: 2026-11-10T00:00:00Z\n");
    writeFileSync(
      join(sReal, "events.jsonl"),
      [
        JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "v1", toolName: "view", arguments: { path: "/w/src/sync.js", view_range: [1, 4] } } }),
        JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "v1", success: true, result: { content: "aaaa\nbbbb\ncccc\ndddd" } } }), // 19 chars (lines 1..4)
        JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "v2", toolName: "view", arguments: { path: "/w/src/sync.js", view_range: [2, 3] } } }),
        JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "v2", success: true, result: { content: "bbbb\ncccc" } } }), // 9 chars, 100% subset overlap of lines 2..3!
        JSON.stringify({ type: "assistant.message", data: { content: "Opened https://github.com/org/app/pull/60" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "Checked https://github.com/org/app/pull/60" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "Ready https://github.com/org/app/pull/60" } }),
        JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 120000 } }),
      ].join("\n") + "\n",
    );

    // 5. Truncated files on PR #61 must mark size medians null instead of contributing a partial 0-line sum
    const rep = collectMetrics({
      repo: "org/app",
      prs: [
        {
          number: 60,
          title: "feat: sync",
          body: "Copied acceptance record only.",
          url: "https://github.com/org/app/pull/60",
          mergedAt: "2026-11-11T10:00:00Z",
          headRefOid: sha60,
          mergeCommit: { oid: sha60 },
          files: [
            { path: "docs/superpowers/plans/2026-11-12-sync.md", additions: 5, deletions: 0 },
            { path: "src/sync.js", additions: 10, deletions: 0 },
          ],
        },
        {
          number: 61,
          title: "feat: huge",
          body: "",
          url: "https://github.com/org/app/pull/61",
          mergedAt: "2026-11-11T11:00:00Z",
          headRefOid: sha60,
          mergeCommit: { oid: sha60 },
          filesTruncated: true,
          files: [{ path: "README.md", additions: 2, deletions: 0 }],
        },
      ],
      from: "2026-11-06T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      checkoutDir: dir,
      sessionsDir,
      targetRef: sha60,
    });

    assert.equal(rep.medianProdLines, null, "filesTruncated PR must prevent misleading partial overall size median");
    assert.equal(rep.routeBuckets["multi-task"].count, 2, "both PR #60 (4-task plan) and PR #61 (filesTruncated) route to multi-task");
    assert.equal(rep.routeBuckets["multi-task"].medianProdLines, null, "filesTruncated PR in bucket marks bucket size median null");
    assert.equal(rep.routeBuckets["multi-task"].medianNanoAiu, 120000, "3 matching JSONL lines beat 1 line with 5 URL repeats");
    assert.equal(rep.routeBuckets["multi-task"].medianDuplicateReadRate, 9 / 28, "subset view_range [2,3] after [1,4] counts 9/28 duplicate chars");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test("T12: trailing newline in view_range output does not mark endLine + 1 as already read", () => {
  const sessionsDir = makeTempDir("sessions-r12");
  try {
    const s = join(sessionsDir, "s-nl");
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, "workspace.yaml"), "id: s-nl\nrepository: org/app\ncreated_at: 2026-11-10T00:00:00Z\n");
    writeFileSync(
      join(s, "events.jsonl"),
      [
        JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "n1", toolName: "view", arguments: { path: "/w/src/f.js", view_range: [1, 1] } } }),
        JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "n1", success: true, result: { content: "a\n" } } }), // 2 chars, line 1 only
        JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "n2", toolName: "view", arguments: { path: "/w/src/f.js", view_range: [2, 2] } } }),
        JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "n2", success: true, result: { content: "b\n" } } }), // 2 chars, line 2 (disjoint -> 0 dup!)
        JSON.stringify({ type: "tool.execution_start", data: { toolCallId: "n3", toolName: "view", arguments: { path: "/w/src/f.js", view_range: [2, 2] } } }),
        JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "n3", success: true, result: { content: "b\n" } } }), // 2 chars, line 2 reread -> 2 dup!
        JSON.stringify({ type: "assistant.message", data: { content: "https://github.com/org/app/pull/70" } }),
      ].join("\n") + "\n",
    );
    const out = analyzeSessions([{ number: 70, url: "https://github.com/org/app/pull/70", mergedAt: "2026-11-11T00:00:00Z" }], {
      sessionsDir,
      repo: "org/app",
    });
    assert.equal(out.perPr[70].totalReadChars, 6);
    assert.equal(out.perPr[70].duplicateReadChars, 2, "disjoint [2,2] after newline-terminated [1,1] must add 0 duplicate chars");
    assert.equal(out.perPr[70].duplicateReadRate, 2 / 6);
  } finally {
    rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test("S-T1: mergeIntervals merges unsorted, overlapping, and touching intervals while ignoring invalid pairs", () => {
  assert.deepEqual(
    mergeIntervals([
      [5000, 8000],
      [1000, 3000],
      [2500, 4000],
      [4000, 4500], // touching
      [7000, 6000], // negative duration -> ignored
      [NaN, 9000], // NaN -> ignored
      null,
    ]),
    [
      [1000, 4500],
      [5000, 8000],
    ],
  );
  assert.deepEqual(mergeIntervals([]), []);
});

test("S-T2: parseSessionEvents excludes ask_user human waits, reading pauses, and unclosed intervals from activeSec", () => {
  const dir = makeTempDir("speed-t2");
  try {
    const evPath = join(dir, "events.jsonl");
    writeFileSync(
      evPath,
      [
        // Turn 0: 10s model thinking, then 2-hour (7200s) ask_user wait
        JSON.stringify({ timestamp: "2026-11-14T10:00:00.000Z", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:10.000Z", type: "assistant.message", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:10.000Z", type: "tool.execution_start", data: { toolCallId: "ask1", toolName: "ask_user", arguments: {} } }),
        JSON.stringify({ timestamp: "2026-11-14T12:00:10.000Z", type: "tool.execution_complete", data: { toolCallId: "ask1", success: true } }),
        JSON.stringify({ timestamp: "2026-11-14T12:00:10.000Z", type: "assistant.turn_end", data: { turnId: "0" } }),
        // 40-minute human reading pause before user replies at 12:40:10Z!
        JSON.stringify({ timestamp: "2026-11-14T12:40:10.000Z", type: "user.message", data: { content: "Approved" } }),
        // Turn 1: 5s model thinking + 2s view + unclosed bash call (must not poison activeSec)
        JSON.stringify({ timestamp: "2026-11-14T12:40:10.000Z", type: "assistant.turn_start", data: { turnId: "1" } }),
        JSON.stringify({ timestamp: "2026-11-14T12:40:15.000Z", type: "assistant.message", data: { turnId: "1" } }),
        JSON.stringify({ timestamp: "2026-11-14T12:40:15.000Z", type: "tool.execution_start", data: { toolCallId: "v1", toolName: "view", arguments: { path: "/a.js" } } }),
        JSON.stringify({ timestamp: "2026-11-14T12:40:17.000Z", type: "tool.execution_complete", data: { toolCallId: "v1", success: true, result: "x" } }),
        JSON.stringify({ timestamp: "2026-11-14T12:40:17.000Z", type: "tool.execution_start", data: { toolCallId: "unclosed", toolName: "bash", arguments: { command: "sleep 999" } } }),
      ].join("\n") + "\n",
    );
    const parsed = parseSessionEvents(evPath);
    assert.equal(parsed.humanWaitSec, 7200);
    assert.equal(parsed.activeSec, 17, "only 10s + 5s model + 2s view = 17s active, excluding 7200s ask_user and 40m reading pause");
    assert.equal(parsed.timeBuckets.modelSec, 15);
    assert.equal(parsed.timeBuckets.ioOtherSec, 2);

    // Timestampless events.jsonl returns activeSec: null (not 0)
    const noTsPath = join(dir, "no-ts.jsonl");
    writeFileSync(noTsPath, JSON.stringify({ type: "assistant.turn_start", data: { turnId: "0" } }) + "\n");
    const noTs = parseSessionEvents(noTsPath);
    assert.equal(noTs.activeSec, null);
    assert.equal(noTs.parallelismFactor, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S-T3: parseSessionEvents deduplicates parallel subagents, ignores nested evt.agentId events, and classifies 5 boxes", () => {
  const dir = makeTempDir("speed-t3");
  try {
    const evPath = join(dir, "events.jsonl");
    writeFileSync(
      evPath,
      [
        // 4s model turn dispatching 3 parallel 60s subagents (10:00:04 -> 10:01:04)
        JSON.stringify({ timestamp: "2026-11-14T10:00:00.000Z", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:04.000Z", type: "assistant.message", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:04.000Z", type: "tool.execution_start", data: { toolCallId: "t1", toolName: "task", arguments: {} } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:04.000Z", type: "tool.execution_start", data: { toolCallId: "t2", toolName: "task", arguments: {} } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:04.000Z", type: "tool.execution_start", data: { toolCallId: "t3", toolName: "task", arguments: {} } }),
        // Nested subagent events carrying agentId must NOT inflate modelSec or ioOtherSec!
        JSON.stringify({ timestamp: "2026-11-14T10:00:05.000Z", agentId: "sub-1", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:35.000Z", agentId: "sub-1", type: "assistant.message", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:35.000Z", agentId: "sub-1", type: "tool.execution_start", data: { toolCallId: "sv1", toolName: "view", arguments: { path: "/x.js" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:40.000Z", agentId: "sub-1", type: "tool.execution_complete", data: { toolCallId: "sv1", success: true, result: "abc" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:04.000Z", type: "tool.execution_complete", data: { toolCallId: "t1", success: true } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:04.000Z", type: "tool.execution_complete", data: { toolCallId: "t2", success: true } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:04.000Z", type: "tool.execution_complete", data: { toolCallId: "t3", success: true } }),
        // Compaction (6s) + Gradle test (20s) + GitHub check-runs poll (30s)
        JSON.stringify({ timestamp: "2026-11-14T10:01:10.000Z", type: "session.compaction_start", data: {} }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:16.000Z", type: "session.compaction_complete", data: {} }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:20.000Z", type: "tool.execution_start", data: { toolCallId: "b1", toolName: "bash", arguments: { command: "./gradlew :app:testDebugUnitTest" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:40.000Z", type: "tool.execution_complete", data: { toolCallId: "b1", success: true } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:40.000Z", type: "tool.execution_start", data: { toolCallId: "p1", toolName: "bash", arguments: { command: "gh api repos/o/r/commits/abc/check-runs && sleep 10" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:02:10.000Z", type: "tool.execution_complete", data: { toolCallId: "p1", success: true } }),
      ].join("\n") + "\n",
    );
    const p = parseSessionEvents(evPath);
    assert.equal(p.timeBuckets.modelSec, 10, "4s turn + 6s compaction, ignoring nested sub-1 turn");
    assert.equal(p.timeBuckets.subagentSec, 60, "3x60s parallel task calls merge to 60s");
    assert.equal(p.timeBuckets.buildTestSec, 20);
    assert.equal(p.timeBuckets.pollSec, 30);
    assert.equal(p.timeBuckets.ioOtherSec, 0, "nested sub-1 view call must not leak into main ioOtherSec");
    assert.equal(p.activeSec, 120);
    // Tool work sum = 60+60+60 (tasks) + 20 (build) + 30 (poll) = 230s; merged tool clock = 60 + 20 + 30 = 110s
    assert.equal(Number(p.parallelismFactor.toFixed(2)), Number((230 / 110).toFixed(2)));
    assert.equal(p.totalReadChars, 3, "existing duplicate-read character accounting still includes subagent reads");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S-T4: collectMetrics and formatMarkdownReport compute route medianActiveSec, dominantBottleneck, medianParallelism, and null shared sessions", () => {
  const gitDir = initGitRepo();
  const sessionsDir = makeTempDir("speed-t4-sess");
  try {
    writeFileSync(join(gitDir, "src/a.js"), "export const a = 1;\n");
    git(gitDir, ["add", "."]);
    git(gitDir, ["commit", "-m", "feat: a (#1)"]);
    const sha1 = git(gitDir, ["rev-parse", "HEAD"]);
    writeFileSync(join(gitDir, "src/b.js"), "export const b = 2;\n");
    git(gitDir, ["add", "."]);
    git(gitDir, ["commit", "-m", "feat: b (#2)"]);
    const sha2 = git(gitDir, ["rev-parse", "HEAD"]);

    // Unique session for PR #1 (small): 10s model + 40s poll = 50s active (pollSec = 80%)
    const s1 = join(sessionsDir, "s-1");
    mkdirSync(s1, { recursive: true });
    writeFileSync(join(s1, "workspace.yaml"), "id: s-1\nrepository: org/app\ncreated_at: 2026-11-10T09:00:00Z\n");
    writeFileSync(
      join(s1, "events.jsonl"),
      [
        JSON.stringify({ timestamp: "2026-11-10T09:00:00.000Z", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-10T09:00:10.000Z", type: "assistant.message", data: { turnId: "0", content: "https://github.com/org/app/pull/1" } }),
        JSON.stringify({ timestamp: "2026-11-10T09:00:10.000Z", type: "tool.execution_start", data: { toolCallId: "p1", toolName: "bash", arguments: { command: "gh api repos/org/app/commits/x/check-runs && sleep 10" } } }),
        JSON.stringify({ timestamp: "2026-11-10T09:00:50.000Z", type: "tool.execution_complete", data: { toolCallId: "p1", success: true } }),
      ].join("\n") + "\n",
    );

    // Shared session for PR #2 and PR #3: 300s active -> must be excluded (null) from per-PR route speed!
    const sShared = join(sessionsDir, "s-shared");
    mkdirSync(sShared, { recursive: true });
    writeFileSync(join(sShared, "workspace.yaml"), "id: s-shared\nrepository: org/app\ncreated_at: 2026-11-10T09:00:00Z\n");
    writeFileSync(
      join(sShared, "events.jsonl"),
      [
        JSON.stringify({ timestamp: "2026-11-10T09:00:00.000Z", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-10T09:05:00.000Z", type: "assistant.message", data: { turnId: "0", content: "https://github.com/org/app/pull/2 and https://github.com/org/app/pull/3" } }),
      ].join("\n") + "\n",
    );

    const prs = [
      { number: 1, url: "https://github.com/org/app/pull/1", mergedAt: "2026-11-10T10:00:00Z", headRefOid: sha1, mergeCommit: { oid: sha1 }, files: [{ path: "src/a.js", additions: 1, deletions: 0 }] },
      { number: 2, url: "https://github.com/org/app/pull/2", mergedAt: "2026-11-10T10:30:00Z", headRefOid: sha2, mergeCommit: { oid: sha2 }, files: [{ path: "src/b.js", additions: 1, deletions: 0 }] },
      { number: 3, url: "https://github.com/org/app/pull/3", mergedAt: "2026-11-10T10:45:00Z", headRefOid: sha2, mergeCommit: { oid: sha2 }, files: [{ path: "README.md", additions: 1, deletions: 0 }] },
    ];
    const sessOut = analyzeSessions(prs, { sessionsDir, repo: "org/app" });
    assert.equal(sessOut.perPr[2].activeSec, null, "shared session per-PR activeSec must be null");
    assert.equal(sessOut.perPr[2].parallelismFactor, null);
    assert.equal(sessOut.perPr[2].timeBuckets, null);
    assert.equal(sessOut.sharedSessions[0].activeSec, 300);

    const rep = collectMetrics({
      repo: "org/app",
      prs,
      from: "2026-11-08T00:00:00Z",
      to: "2026-11-13T00:00:00Z",
      sessionsDir,
      checkoutDir: gitDir,
    });
    assert.equal(rep.routeBuckets.small.medianActiveSec, 50);
    assert.equal(rep.routeBuckets.small.dominantBottleneck, "pollSec");
    assert.equal(rep.routeBuckets.small.dominantBottleneckShare, 0.8);
    assert.equal(rep.routeBuckets.small.medianParallelism, 1);
    assert.equal(rep.routeBuckets.trivial.medianActiveSec, null);
    assert.equal(rep.routeBuckets.trivial.dominantBottleneck, null);

    const md = formatMarkdownReport(rep);
    assert.match(md, /Median active \(s\)/);
    assert.match(md, /pollSec \(80\.0%\)/);
    assert.match(md, /1\.00x/);
    assert.match(md, /300\.0s active/);
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
    rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test("S-T6: review regressions — multi-digit sleep, verdict repo slug vs CLI, runtime shellId on read_bash, read_agent/sub-subagent/subagent.failed, and 0s sessions", () => {
  const dir = makeTempDir("speed-t6");
  try {
    const evPath = join(dir, "events.jsonl");
    writeFileSync(
      evPath,
      [
        // 1. Multi-digit `sleep 30` and `divydvd/verdict` repo poll must go to pollSec (not ioOtherSec or buildTestSec!)
        JSON.stringify({ timestamp: "2026-11-14T10:00:00.000Z", type: "tool.execution_start", data: { toolCallId: "p1", toolName: "bash", arguments: { command: "sleep 30" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:30.000Z", type: "tool.execution_complete", data: { toolCallId: "p1", success: true } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:30.000Z", type: "tool.execution_start", data: { toolCallId: "p2", toolName: "bash", arguments: { command: "gh api graphql -f query='{reviewThreads}' && gh pr view 9 -R divydvd/verdict && sleep 10s" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:40.000Z", type: "tool.execution_complete", data: { toolCallId: "p2", success: true } }),
        // Plain git command in /copilot-worktrees/verdict/ path -> ioOtherSec; real `verdict run` CLI -> buildTestSec
        JSON.stringify({ timestamp: "2026-11-14T10:00:40.000Z", type: "tool.execution_start", data: { toolCallId: "io1", toolName: "bash", arguments: { command: "git -C /tmp/copilot-worktrees/verdict/main status" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:42.000Z", type: "tool.execution_complete", data: { toolCallId: "io1", success: true } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:42.000Z", type: "tool.execution_start", data: { toolCallId: "vcli", toolName: "bash", arguments: { command: "verdict run login-flow" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:00:50.000Z", type: "tool.execution_complete", data: { toolCallId: "vcli", success: true } }),

        // 2. bash without explicit args.shellId emits runtime `<command with shellId: 1374 ...>`, followed by read_bash({ shellId: "1374" }) -> both in buildTestSec!
        JSON.stringify({ timestamp: "2026-11-14T10:01:00.000Z", type: "tool.execution_start", data: { toolCallId: "b1", toolName: "bash", arguments: { command: "./gradlew :app:testDebugUnitTest" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:30.000Z", type: "tool.execution_complete", data: { toolCallId: "b1", success: true, result: "<command with shellId: 1374 is still running after 30 seconds>" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:01:30.000Z", type: "tool.execution_start", data: { toolCallId: "rb1", toolName: "read_bash", arguments: { shellId: "1374", delay: 120 } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:03:30.000Z", type: "tool.execution_complete", data: { toolCallId: "rb1", success: true, result: "BUILD SUCCESSFUL\n<shellId: 1374 completed with exit code 0>" } }),

        // 3. Single background task (10:04:00 -> 10:05:40 = 100s, ending in subagent.failed) with blocking read_agent(5s..100s) AND nested sub-subagent (10s..50s):
        //    must count 100s subagentSec once with 1.00x serial parallelism!
        JSON.stringify({ timestamp: "2026-11-14T10:04:00.000Z", type: "tool.execution_start", data: { toolCallId: "bg1", toolName: "task", arguments: { mode: "background" } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:04:00.050Z", agentId: "ag-bg-1", parentId: "evt-1", type: "subagent.started", data: { toolCallId: "bg1", executionMode: "background" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:04:00.100Z", type: "tool.execution_complete", data: { toolCallId: "bg1", success: true, result: { content: "Agent started in background with agent_id: ag-bg-1." } } }),
        // Nested sub-subagent inside ag-bg-1 (must be ignored by main subagentBounds!)
        JSON.stringify({ timestamp: "2026-11-14T10:04:10.000Z", agentId: "ag-bg-1", type: "tool.execution_start", data: { toolCallId: "nested-t1", toolName: "task", arguments: {} } }),
        JSON.stringify({ timestamp: "2026-11-14T10:04:10.010Z", agentId: "ag-nested-1", type: "subagent.started", data: { toolCallId: "nested-t1" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:04:50.000Z", agentId: "ag-nested-1", type: "subagent.completed", data: { toolCallId: "nested-t1" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:04:50.010Z", agentId: "ag-bg-1", type: "tool.execution_complete", data: { toolCallId: "nested-t1", success: true } }),
        // Blocking read_agent on ag-bg-1
        JSON.stringify({ timestamp: "2026-11-14T10:04:05.000Z", type: "tool.execution_start", data: { toolCallId: "ra1", toolName: "read_agent", arguments: { agent_id: "ag-bg-1", wait: true } } }),
        JSON.stringify({ timestamp: "2026-11-14T10:05:40.000Z", agentId: "ag-bg-1", type: "subagent.failed", data: { toolCallId: "bg1" } }),
        JSON.stringify({ timestamp: "2026-11-14T10:05:40.000Z", type: "tool.execution_complete", data: { toolCallId: "ra1", success: true } }),
      ].join("\n") + "\n",
    );

    const p = parseSessionEvents(evPath);
    assert.equal(p.timeBuckets.pollSec, 40, "30s sleep + 10s reviewThreads/divydvd/verdict poll = 40s");
    assert.equal(p.timeBuckets.ioOtherSec, 2, "only git status in verdict worktree = 2s");
    assert.equal(p.timeBuckets.buildTestSec, 158, "8s verdict CLI + 30s bash + 120s runtime-shellId read_bash = 158s");
    assert.equal(p.timeBuckets.subagentSec, 100, "background task closed by subagent.failed = 100s");
    assert.equal(Number(p.parallelismFactor.toFixed(2)), 1.0, "strictly serial intervals (including read_agent wait and nested sub-subagent) = 1.00x");

    // 4. Valid 0s (same-ms) session stays included in bucketMediansSec alongside 10s session (median = 5s)
    const sessDir = join(dir, "sessions");
    mkdirSync(join(sessDir, "s0"), { recursive: true });
    mkdirSync(join(sessDir, "s10"), { recursive: true });
    writeFileSync(join(sessDir, "s0", "workspace.yaml"), "id: s0\nrepository: org/app\ncreated_at: 2026-11-14T09:00:00Z\n");
    writeFileSync(
      join(sessDir, "s0", "events.jsonl"),
      [
        JSON.stringify({ timestamp: "2026-11-14T09:00:00.000Z", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T09:00:00.000Z", type: "assistant.message", data: { turnId: "0", content: "https://github.com/org/app/pull/1" } }),
      ].join("\n") + "\n",
    );
    writeFileSync(join(sessDir, "s10", "workspace.yaml"), "id: s10\nrepository: org/app\ncreated_at: 2026-11-14T09:00:00Z\n");
    writeFileSync(
      join(sessDir, "s10", "events.jsonl"),
      [
        JSON.stringify({ timestamp: "2026-11-14T09:00:00.000Z", type: "assistant.turn_start", data: { turnId: "0" } }),
        JSON.stringify({ timestamp: "2026-11-14T09:00:10.000Z", type: "assistant.message", data: { turnId: "0", content: "https://github.com/org/app/pull/2" } }),
      ].join("\n") + "\n",
    );
    const zeroRep = collectMetrics({
      repo: "org/app",
      prs: [
        { number: 1, url: "https://github.com/org/app/pull/1", mergedAt: "2026-11-14T10:00:00Z", files: [{ path: "README.md", additions: 1, deletions: 0 }] },
        { number: 2, url: "https://github.com/org/app/pull/2", mergedAt: "2026-11-14T10:05:00Z", files: [{ path: "README.md", additions: 1, deletions: 0 }] },
      ],
      sessionsDir: sessDir,
    });
    assert.equal(zeroRep.routeBuckets.trivial.medianActiveSec, 5);
    assert.equal(zeroRep.routeBuckets.trivial.bucketMediansSec.modelSec, 5, "0s session must be retained in bucketMediansSec");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


