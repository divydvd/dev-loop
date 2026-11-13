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
  try {
    const prsPath = join(root, "prs.json");
    const prs = [
      {
        number: 1,
        title: "fix: trim input",
        body: "",
        url: "https://github.com/org/app/pull/1",
        createdAt: "2026-11-10T10:00:00Z",
        mergedAt: "2026-11-10T11:00:00Z",
        headRefOid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
        files: [{ path: "src/trim.js", additions: 10, deletions: 2 }],
        commits: [{ committedDate: "2026-11-10T09:58:00Z" }], // 0 post-open commits -> first-push green!
      },
      {
        number: 2,
        title: "docs: update readme",
        body: "",
        url: "https://github.com/org/app/pull/2",
        createdAt: "2026-11-11T10:00:00Z",
        mergedAt: "2026-11-11T12:00:00Z",
        headRefOid: "bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222",
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
        validations: [{ sha: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111", exit: 0, dirty: false, tasks: "test" }],
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
      checkoutDir: null,
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
    assert.equal(report.durability.codeSurvival.rate, null); // checkoutDir null -> n/a

    const md = formatMarkdownReport(report);
    assert.match(md, /Code survival rate \(14d\).*n\/a/);
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
