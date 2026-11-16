import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTER_PATH = join(REPO_ROOT, "skills/dev-loop/scripts/prepare-review-panel.mjs");

function cleanChildEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  return env;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    env: cleanChildEnv(),
    encoding: "utf8",
  }).trim();
}

function runRouterCli(args) {
  return spawnSync(process.execPath, [ROUTER_PATH, ...args], {
    cwd: REPO_ROOT,
    env: cleanChildEnv(),
    encoding: "utf8",
  });
}

function makeFixtureRepo(t, initialFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), "dev-loop-review-panel-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repoDir = join(root, "repo");
  const outRoot = join(root, "packets");
  mkdirSync(repoDir, { recursive: true });
  git(repoDir, ["init", "-b", "main"]);
  git(repoDir, ["config", "user.name", "Test Bot"]);
  git(repoDir, ["config", "user.email", "test@example.com"]);

  const defaults = {
    "AGENTS.md": [
      "# Sample Project",
      "",
      "### Risky areas",
      "- `src/billing/ledger.ts`: touches balance accounting.",
      "- `com.github.copilot/rules/core.mdc`: global session rules.",
      "",
      "### Review checklist",
      "- Preserve idempotent transaction IDs on retries.",
      "- Never log raw tokens or personal emails.",
      "",
    ].join("\n"),
    "README.md": [
      "# Sample App",
      "",
      "This guide explains teh setup workflow for contributors.",
      "",
      "```sh",
      ...Array.from({ length: 30 }, (_, i) => `echo "step ${i + 1}"`),
      "```",
      "",
    ].join("\n"),
    ...initialFiles,
  };

  for (const [rel, content] of Object.entries(defaults)) {
    const abs = join(repoDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "initial"]);
  const baseSha = git(repoDir, ["rev-parse", "HEAD"]);
  git(repoDir, ["checkout", "-b", "feature"]);
  return { root, repoDir, outRoot, baseSha };
}

function writeAndCommit(repoDir, files, message = "change") {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(repoDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  git(repoDir, ["add", "-A"]);
  git(repoDir, ["commit", "-m", message]);
  return git(repoDir, ["rev-parse", "HEAD"]);
}

test("1. prose typo fix in README.md routes to mode exempt with zero roles", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t);
  const current = readFileSync(join(repoDir, "README.md"), "utf8");
  writeAndCommit(repoDir, {
    "README.md": current.replace("explains teh setup", "explains the setup"),
  });

  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.mode, "exempt");
  assert.deepEqual(parsed.roles, []);
  assert.equal(parsed.synthesisJudge, false);
  assert.equal(parsed.prodLinesChanged, 0);
});

test("2. operational command edit in skills/flow-docs/SKILL.md is never exempt", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t, {
    "skills/flow-docs/SKILL.md": [
      "---",
      "name: flow-docs",
      "description: Maintain flow docs.",
      "---",
      "",
      "Run `node scripts/check-flows.mjs` before committing.",
      "",
    ].join("\n"),
  });
  writeAndCommit(repoDir, {
    "skills/flow-docs/SKILL.md": [
      "---",
      "name: flow-docs",
      "description: Maintain flow docs.",
      "---",
      "",
      "Run `node scripts/check-flows.mjs --strict` before committing.",
      "",
    ].join("\n"),
  });

  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.notEqual(parsed.mode, "exempt");
  assert.ok(["single", "panel"].includes(parsed.mode));
  assert.ok(parsed.prodLinesChanged > 0);
});

test("3. fenced-block command edits, inline code edits, and normative rule edits in README.md are not exempt", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t);
  const original = readFileSync(join(repoDir, "README.md"), "utf8");

  // Edit deep inside a 30-line fenced code block (no ``` fence in -U3 diff context)
  writeAndCommit(repoDir, {
    "README.md": original.replace('echo "step 15"', 'echo "step 15" --force'),
  });
  const fencedRes = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(fencedRes.status, 0, fencedRes.stderr);
  assert.notEqual(JSON.parse(fencedRes.stdout).mode, "exempt");

  // Reset and edit normative rule text ("must") in prose
  writeAndCommit(repoDir, {
    "README.md": `${original}\nContributors must run smoke verification before release.\n`,
  });
  const ruleRes = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(ruleRes.status, 0, ruleRes.stderr);
  assert.notEqual(JSON.parse(ruleRes.stdout).mode, "exempt");
});

test("4. 45-line single-domain concurrency fix outside risky areas routes to mode single", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t, {
    "src/queue/workerPool.ts": "export class WorkerPool {}\n",
  });
  const lines = [
    "export class WorkerPool {",
    "  private readonly lock = new Mutex();",
    "  async drainQueue(items: string[]): Promise<number> {",
    "    await this.lock.acquire();",
    ...Array.from({ length: 37 }, (_, i) => `    const step${i} = items[${i}] ?? "";`),
    "    return items.length;",
    "  }",
    "}",
  ];
  // 1 line removed + 44 lines added = exact 45 prod lines changed
  assert.equal(lines.length, 44);
  writeAndCommit(repoDir, {
    "src/queue/workerPool.ts": `${lines.join("\n")}\n`,
  });

  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.touchesRiskyArea, false);
  assert.deepEqual(parsed.triggeredDomains, ["concurrency-state"]);
  assert.equal(parsed.prodLinesChanged, 45);
  assert.equal(parsed.mode, "single");
  assert.deepEqual(parsed.roles, ["single-reviewer"]);
  assert.equal(parsed.synthesisJudge, false);
});

test("5. 30-line edit touching AGENTS.md risky area escalates to panel with 2-4 roles and skeptic-judge", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t, {
    "src/billing/ledger.ts": "export function totalCents(xs: number[]): number { return xs.reduce((a, b) => a + b, 0); }\n",
  });
  const updated = [
    "export function totalCents(xs: number[]): number {",
    ...Array.from({ length: 27 }, (_, i) => `  const adjustment${i} = ${i};`),
    "  return xs.reduce((a, b) => a + b, 0) + adjustment0;",
    "}",
  ];
  writeAndCommit(repoDir, {
    "src/billing/ledger.ts": `${updated.join("\n")}\n`,
  });

  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.touchesRiskyArea, true);
  assert.equal(parsed.mode, "panel");
  assert.ok(parsed.roles.length >= 2 && parsed.roles.length <= 4, `expected 2-4 roles, got ${JSON.stringify(parsed.roles)}`);
  assert.ok(parsed.roles.includes("arch-correctness"));
  assert.equal(parsed.synthesisJudge, true);
  assert.equal(parsed.judgeRole, "skeptic-judge");
});

test("6. 180-line multi-domain feature (@Composable + CoroutineScope + authToken) routes all 4 specialists and writes frozen packets outside repoRoot", (t) => {
  const { repoDir, outRoot, baseSha } = makeFixtureRepo(t);
  const ktLines = [
    "package com.example.app.ui",
    "",
    "@Composable",
    "fun ProfileScreen(scope: CoroutineScope, authToken: String) {",
    ...Array.from({ length: 175 }, (_, i) => `  val itemLabel${i} = "Row ${i}: " + authToken.length`),
    "}",
  ];
  const headSha = writeAndCommit(repoDir, {
    "app/src/main/java/com/example/app/ui/ProfileScreen.kt": `${ktLines.join("\n")}\n`,
  });

  const res = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--head",
    headSha,
    "--out-dir",
    outRoot,
    "--json",
  ]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.mode, "panel");
  assert.deepEqual(parsed.roles, [
    "arch-correctness",
    "concurrency-state",
    "security-privacy",
    "ui-a11y",
  ]);
  assert.equal(parsed.synthesisJudge, true);
  assert.equal(parsed.judgeRole, "skeptic-judge");
  assert.ok(parsed.prodLinesChanged >= 180);

  // Verify frozen packets exist outside repoRoot and git working tree is clean
  assert.equal(git(repoDir, ["status", "--porcelain"]), "");
  assert.ok(existsSync(join(outRoot, "routing.json")));
  for (const role of parsed.roles) {
    const packetPath = join(outRoot, `${role}-packet.md`);
    assert.ok(existsSync(packetPath), `missing packet: ${packetPath}`);
    const packet = readFileSync(packetPath, "utf8");
    assert.ok(packet.includes(baseSha));
    assert.ok(packet.includes(headSha));
    assert.ok(packet.includes("ProfileScreen.kt"));
    assert.match(packet, /"severity":\s*"Critical"\s*\|\s*"Important"\s*\|\s*"Minor"/);
    assert.ok(packet.includes("suggestedFix"));
  }
  assert.ok(existsSync(join(outRoot, "skeptic-judge-packet.md")));
});

test("7. false-positive guard: author, evaluate, execute, and workflow do not trigger security or concurrency domains", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t);
  const lines = [
    "export function formatBookSummary(author: string, workflow: string): string {",
    "  const evaluateScore = author.trim().length;",
    "  const executeFormatting = `${author}:${workflow}:${evaluateScore}`;",
    ...Array.from({ length: 15 }, (_, i) => `  const line${i} = executeFormatting;`),
    "  return executeFormatting;",
    "}",
  ];
  writeAndCommit(repoDir, {
    "src/books/formatter.ts": `${lines.join("\n")}\n`,
  });

  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.deepEqual(parsed.triggeredDomains, []);
  assert.equal(parsed.mode, "single");
  assert.deepEqual(parsed.roles, ["single-reviewer"]);
});

test("8. rejects --out-dir inside repoRoot (including symlink aliases) and hyphen-prefixed git refs", (t) => {
  const { root, repoDir, baseSha } = makeFixtureRepo(t);
  writeAndCommit(repoDir, { "src/index.ts": "export const x = 1;\n" });

  // Direct in-repo out-dir
  const insideRes = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--out-dir",
    join(repoDir, ".tmp-packets"),
  ]);
  assert.equal(insideRes.status, 1);
  assert.match(insideRes.stderr, /out-dir.*outside.*repo/i);
  assert.equal(existsSync(join(repoDir, ".tmp-packets")), false);

  // Symlinked repo alias trying to sneak --out-dir inside real repoDir
  const symlinkRepo = join(root, "repo-link");
  symlinkSync(repoDir, symlinkRepo);
  const symlinkInsideRes = runRouterCli([
    "--repo-root",
    symlinkRepo,
    "--base",
    baseSha,
    "--out-dir",
    join(repoDir, "sneaky-packets"),
  ]);
  assert.equal(symlinkInsideRes.status, 1);
  assert.match(symlinkInsideRes.stderr, /out-dir.*outside.*repo/i);
  assert.equal(existsSync(join(repoDir, "sneaky-packets")), false);

  // Hyphen-prefixed git ref injection guard
  const badRefRes = runRouterCli([
    "--repo-root",
    repoDir,
    "--base=--output=/tmp/pwn",
  ]);
  assert.equal(badRefRes.status, 1);
  assert.match(badRefRes.stderr, /invalid git ref/i);

  // Symlinked script entrypoint still runs main() and prints JSON
  const symlinkScript = join(root, "linked-router.mjs");
  symlinkSync(ROUTER_PATH, symlinkScript);
  const linkedRun = spawnSync(process.execPath, [symlinkScript, "--repo-root", repoDir, "--base", baseSha, "--json"], {
    cwd: REPO_ROOT,
    env: cleanChildEnv(),
    encoding: "utf8",
  });
  assert.equal(linkedRun.status, 0, linkedRun.stderr);
  assert.equal(JSON.parse(linkedRun.stdout).mode, "single");
});

test("9. handles missing review-checklist.md gracefully and filters Active rules when present", (t) => {
  const { repoDir, outRoot, baseSha } = makeFixtureRepo(t);
  writeAndCommit(repoDir, {
    "app/ui/LoginScreen.kt": [
      "@Composable",
      "fun LoginScreen(authToken: String) {",
      "  val header = authToken",
      "}",
      "",
    ].join("\n"),
  });

  const missingDir = join(outRoot, "without-checklist");
  const withoutRes = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--out-dir",
    missingDir,
    "--json",
  ]);
  assert.equal(withoutRes.status, 0, withoutRes.stderr);
  const withoutJson = JSON.parse(withoutRes.stdout);
  assert.equal(withoutJson.checklistLoaded, false);
  const secPacketWithout = readFileSync(join(missingDir, "security-privacy-packet.md"), "utf8");
  assert.ok(secPacketWithout.includes("Never log raw tokens or personal emails."));

  // Now add docs/testing/review-checklist.md with Active rules and Retired rules
  writeAndCommit(repoDir, {
    "docs/testing/review-checklist.md": [
      "# Project Review Checklist",
      "",
      "## Active rules",
      "| Rule ID | Domain | Rule | Source PRs |",
      "| --- | --- | --- | --- |",
      "| `R-SEC-1` | `security-privacy` | Redact bearer tokens in crash breadcrumbs. | #12, #18 |",
      "| `R-UI-1` | `ui-a11y` | Every icon button needs contentDescription. | #14, #19 |",
      "| `R-CONC-1` | `concurrency-state` | Cancel child coroutines on view detach. | #15, #20 |",
      "",
      "## Retired rules",
      "| Rule ID | Domain | Reason |",
      "| --- | --- | --- |",
      "| `R-OLD-1` | `security-privacy` | Legacy v1 auth removed. |",
      "",
    ].join("\n"),
  });

  const presentDir = join(outRoot, "with-checklist");
  const withRes = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--out-dir",
    presentDir,
    "--json",
  ]);
  assert.equal(withRes.status, 0, withRes.stderr);
  const withJson = JSON.parse(withRes.stdout);
  assert.equal(withJson.checklistLoaded, true);
  const secPacketWith = readFileSync(join(presentDir, "security-privacy-packet.md"), "utf8");
  assert.ok(secPacketWith.includes("R-SEC-1"));
  assert.equal(secPacketWith.includes("R-UI-1"), false);
  assert.equal(secPacketWith.includes("R-OLD-1"), false);
  const uiPacketWith = readFileSync(join(presentDir, "ui-a11y-packet.md"), "utf8");
  assert.ok(uiPacketWith.includes("R-UI-1"));
});

test("10. --head WORKTREE captures tracked modifications, tracked deletions, and untracked files with deterministic SHA-256", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t, {
    "src/obsolete.ts": "export const obsolete = true;\n",
  });

  // Delete tracked file + add untracked file without committing
  unlinkSync(join(repoDir, "src/obsolete.ts"));
  mkdirSync(join(repoDir, "src/auth"), { recursive: true });
  writeFileSync(
    join(repoDir, "src/auth/session.ts"),
    "export async function refresh(authToken: string) { return await Promise.resolve(authToken); }\n",
    "utf8"
  );

  const res1 = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--head",
    "WORKTREE",
    "--json",
  ]);
  assert.equal(res1.status, 0, res1.stderr);
  const parsed1 = JSON.parse(res1.stdout);
  assert.match(parsed1.head, /^WORKTREE:[0-9a-f]{64}$/);
  assert.ok(parsed1.changedFiles.includes("src/obsolete.ts"));
  assert.ok(parsed1.changedFiles.includes("src/auth/session.ts"));
  assert.equal(parsed1.mode, "panel");
  assert.deepEqual(parsed1.roles, ["arch-correctness", "concurrency-state", "security-privacy"]);

  // Repeat without edits -> identical digest
  const res2 = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--head",
    "WORKTREE",
    "--json",
  ]);
  assert.equal(JSON.parse(res2.stdout).head, parsed1.head);

  // Modify untracked file -> digest changes
  writeFileSync(
    join(repoDir, "src/auth/session.ts"),
    "export async function refresh(authToken: string) { return await Promise.resolve(authToken.trim()); }\n",
    "utf8"
  );
  const res3 = runRouterCli([
    "--repo-root",
    repoDir,
    "--base",
    baseSha,
    "--head",
    "WORKTREE",
    "--json",
  ]);
  assert.notEqual(JSON.parse(res3.stdout).head, parsed1.head);
});

test("11. excludes tests, docs, and lockfiles from prodLinesChanged while counting plugin operational paths", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t);
  writeAndCommit(repoDir, {
    "src/math.test.ts": Array.from({ length: 200 }, (_, i) => `// test line ${i}`).join("\n") + "\n",
    "docs/architecture.md": "Updated architecture overview.\n",
    "package-lock.json": '{\n  "lockfileVersion": 3\n}\n',
  });

  const testOnlyRes = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(testOnlyRes.status, 0, testOnlyRes.stderr);
  const testOnlyJson = JSON.parse(testOnlyRes.stdout);
  assert.equal(testOnlyJson.prodLinesChanged, 0);
  assert.notEqual(testOnlyJson.mode, "exempt");
  assert.equal(testOnlyJson.mode, "single");

  // Operational workflow file in .github/workflows/ counts toward prodLinesChanged
  writeAndCommit(repoDir, {
    ".github/workflows/ci.yml": Array.from({ length: 15 }, (_, i) => `# step ${i}`).join("\n") + "\n",
  });
  const workflowRes = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(workflowRes.status, 0, workflowRes.stderr);
  assert.ok(JSON.parse(workflowRes.stdout).prodLinesChanged >= 15);
});

test("12. AC-1: behavior-changing prose in README.md ('before release' -> 'after release') is never exempt", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t, {
    "README.md": "# Guide\n\nRun the smoke suite before release.\n",
  });
  writeAndCommit(repoDir, {
    "README.md": "# Guide\n\nRun the smoke suite after release.\n",
  });
  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  assert.notEqual(JSON.parse(res.stdout).mode, "exempt");
});

test("13. AC-2 & AC-3: concept-based risky areas and zero-segment globstars ('src/**/auth.js' -> 'src/auth.js') escalate to panel", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t, {
    "AGENTS.md": [
      "# Project",
      "",
      "### Risky areas",
      "- `src/**/auth.js`: auth boundary",
      "- The approval points and the finish rules: they decide when an agent stops or merges.",
      "",
    ].join("\n"),
    "src/auth.js": "export const ok = true;\n",
    "skills/dev-loop/SKILL.md": "# Skill\n\n## Finish\nKeep the finish rules strict.\n",
  });

  // Zero-segment globstar match: src/**/auth.js must match src/auth.js
  const globHead = writeAndCommit(repoDir, {
    "src/auth.js": "export const ok = false;\n",
  });
  const globRes = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", globHead, "--json"]).stdout);
  assert.equal(globRes.touchesRiskyArea, true);
  assert.equal(globRes.mode, "panel");

  // Concept risky-area match on changed section touching 'finish rules'
  const conceptBase = globHead;
  const conceptHead = writeAndCommit(repoDir, {
    "skills/dev-loop/SKILL.md": "# Skill\n\n## Finish\nUpdate the finish rules and approval points.\n",
  });
  const conceptRes = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", conceptBase, "--json"]).stdout);
  assert.equal(conceptRes.touchesRiskyArea, true);
  assert.equal(conceptRes.mode, "panel");

  // Concept phrase appearing ONLY inside a test file alongside a benign prod edit must NOT trigger touchesRiskyArea
  writeAndCommit(repoDir, {
    "src/math.js": "export const sum = (a, b) => a + b;\n",
    "scripts/router.test.mjs": "// fixture mentioning approval points and finish rules\n",
  });
  const nonRiskyRes = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", conceptHead, "--json"]).stdout);
  assert.equal(nonRiskyRes.touchesRiskyArea, false);
  assert.equal(nonRiskyRes.mode, "single");
});

test("14. AC-4: operational skills/** references and assets count toward prodLinesChanged and 120 vs 121 threshold", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t);
  const h120 = writeAndCommit(repoDir, {
    "skills/dev-loop/references/guide.md": Array.from({ length: 120 }, (_, i) => `Line ${i}`).join("\n") + "\n",
  });
  const r120 = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", h120, "--json"]).stdout);
  assert.equal(r120.prodLinesChanged, 120);
  assert.equal(r120.mode, "single");

  const h121 = writeAndCommit(repoDir, {
    "skills/dev-loop/assets/template.md": "Extra operational line\n",
  });
  const r121 = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", h121, "--json"]).stdout);
  assert.equal(r121.prodLinesChanged, 121);
  assert.equal(r121.mode, "panel");
});

test("15. AC-5: 9-column PR-2 review-checklist.md schema emits actual Check and Source PRs into role packets", (t) => {
  const { repoDir, outRoot, baseSha } = makeFixtureRepo(t);
  writeAndCommit(repoDir, {
    "docs/testing/review-checklist.md": [
      "# Review Checklist",
      "",
      "## Active rules",
      "| ID | Domain | Trigger paths | Check | Evidence example | Added | Last hit | Status | Source PRs |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| `RC-1` | `security-privacy` | `src/auth/**` | Verify token scopes before cache write. | `auth.ts:42` | 2026-11-01 | 2026-11-15 | active | #31, #39 |",
      "| `RC-2` | `security-privacy` | `src/auth/**` | Obsolete check. | - | 2026-10-01 | 2026-10-02 | retired | #10 |",
      "",
    ].join("\n"),
    "src/auth/tokenStore.ts": "export async function save(authToken: string) { return await Promise.resolve(authToken); }\n",
  });

  const outDir = join(outRoot, "nine-col");
  const res = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--out-dir", outDir, "--json"]);
  assert.equal(res.status, 0, res.stderr);
  const packet = readFileSync(join(outDir, "security-privacy-packet.md"), "utf8");
  assert.ok(packet.includes("Verify token scopes before cache write."), packet);
  assert.ok(packet.includes("#31, #39"), packet);
  assert.equal(packet.includes("Obsolete check."), false);
});

test("16. AC-7, UA-2, UA-3: Swift Task closures, compound camelCase/snake_case a11y tokens, and qualified Android res/layout-land paths trigger domains", (t) => {
  const { repoDir, baseSha } = makeFixtureRepo(t);
  writeAndCommit(repoDir, {
    "ios/ProfileLoader.swift": "func load() {\n  Task {\n    performSync()\n  }\n}\n",
    "app/src/main/res/layout-land/profile.xml": "<TextView android:id=\"@+id/title\" />\n",
    "src/a11y/Helper.kt": "val buttonContentDescription = \"Save\"\n",
  });

  const res = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--json"]).stdout);
  assert.ok(res.triggeredDomains.includes("concurrency-state"), JSON.stringify(res.triggeredDomains));
  assert.ok(res.triggeredDomains.includes("ui-a11y"), JSON.stringify(res.triggeredDomains));
  assert.equal(res.mode, "panel");
});

test("17. CS-2 & SG-1: WORKTREE handles untracked dangling/file symlinks and mode changes, and --out-dir rejects pre-existing packet symlinks", (t) => {
  const { repoDir, outRoot, baseSha } = makeFixtureRepo(t);
  const originalReadme = readFileSync(join(repoDir, "README.md"), "utf8");

  // Untracked dangling symlink in WORKTREE must not crash or classify as exempt
  symlinkSync("nonexistent-target-v1", join(repoDir, "broken-link"));
  const r1 = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", "WORKTREE", "--json"]);
  assert.equal(r1.status, 0, r1.stderr);
  const j1 = JSON.parse(r1.stdout);
  assert.ok(j1.changedFiles.includes("broken-link"));
  assert.notEqual(j1.mode, "exempt");

  // Retargeting symlink changes WORKTREE digest
  unlinkSync(join(repoDir, "broken-link"));
  symlinkSync("nonexistent-target-v2", join(repoDir, "broken-link"));
  const j2 = JSON.parse(runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", "WORKTREE", "--json"]).stdout);
  assert.notEqual(j2.head, j1.head);

  // Stale packet files in --out-dir are cleaned before writing fresh packets
  const cleanOut = join(outRoot, "reused-out");
  mkdirSync(cleanOut, { recursive: true });
  writeFileSync(join(cleanOut, "ui-a11y-packet.md"), "stale", "utf8");
  const rClean = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", "WORKTREE", "--out-dir", cleanOut, "--json"]);
  assert.equal(rClean.status, 0, rClean.stderr);
  assert.equal(existsSync(join(cleanOut, "ui-a11y-packet.md")), false);

  // Pre-existing symlink at <out-dir>/routing.json pointing inside repoDir must be rejected
  const poisonedOut = join(outRoot, "poisoned-out");
  mkdirSync(poisonedOut, { recursive: true });
  symlinkSync(join(repoDir, "README.md"), join(poisonedOut, "routing.json"));
  const bad = runRouterCli(["--repo-root", repoDir, "--base", baseSha, "--head", "WORKTREE", "--out-dir", poisonedOut, "--json"]);
  assert.notEqual(bad.status, 0);
  assert.equal(readFileSync(join(repoDir, "README.md"), "utf8"), originalReadme);
});
