import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { scanFlowDrift } from "../skills/flow-docs/scripts/scan-flow-drift.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCANNER_PATH = resolve(__dirname, "../skills/flow-docs/scripts/scan-flow-drift.mjs");

function cleanEnv(extra = {}) {
  const out = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Test Author",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test Author",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("GIT_") && k !== "NODE_TEST_CONTEXT" && k !== "NODE_OPTIONS") {
      out[k] = v;
    }
  }
  return { ...out, ...extra };
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    env: cleanEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeRepoFile(repoRoot, relPath, content) {
  const full = join(repoRoot, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function initRepo(t) {
  const parent = mkdtempSync(join(tmpdir(), "flow-drift-test-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const repoRoot = join(parent, "repo");
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ["init", "-b", "main"]);
  return { parent, repoRoot };
}

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [SCANNER_PATH, ...args], {
    env: cleanEnv(extraEnv),
    encoding: "utf8",
    timeout: 15_000,
  });
}

test("T1: returns no_flows and exits 0 when docs/flows/INDEX.md does not exist", (t) => {
  const { repoRoot } = initRepo(t);
  writeRepoFile(repoRoot, "README.md", "# No flows\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "init"]);

  const direct = scanFlowDrift({ repoRoot });
  assert.deepEqual(direct, {
    status: "no_flows",
    flowsDir: "docs/flows",
    docs: [],
    indexIssues: [],
    unupdatedImpactedDocs: [],
  });

  const cli = runCli(["--repo-root", repoRoot, "--json", "--fail-on-unupdated"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), direct);
});

test("T2: clean indexed flow doc scores 0 and ignores routes, functions, commands, and slash shorthands", (t) => {
  const { repoRoot } = initRepo(t);
  writeRepoFile(repoRoot, "src/checkout/Cart.ts", "export const cart = true;\n");
  writeRepoFile(repoRoot, "src/checkout/Pay.ts", "export const pay = true;\n");
  writeRepoFile(repoRoot, "tests/checkout.test.ts", "export const ok = true;\n");
  writeRepoFile(
    repoRoot,
    "docs/flows/payment.md",
    `# Payment\n\nLast verified: 2026-10-01.\n\n## Key files\n| File | Role |\n| --- | --- |\n| \`src/checkout/Pay.ts\` | Charge card |\n`,
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/checkout.md",
    [
      "# Checkout",
      "",
      "Last verified: 2026-10-01.",
      "",
      "## Entry points",
      "- User opens `/checkout` → `./src/checkout/Cart.ts` `submitOrder` (`https://example.com/pay`)",
      "",
      "## Sequence",
      "1. Validate cart (`src/checkout/Cart.ts:12`)",
      "2. Charge card (`src/checkout/Pay.ts`)",
      "",
      "## Key files",
      "| File | Role |",
      "| --- | --- |",
      "| `src/checkout/Cart.ts` | Cart state (`n/a`, `true/false`) |",
      "| `src/checkout/Pay.ts` | Payment capture |",
      "",
      "## Tests",
      "- Unit: `./gradlew test` and `tests/checkout.test.ts`",
      "",
      "## Related flows",
      "- [Payment](payment.md)",
      "",
    ].join("\n"),
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    [
      "# Flow docs",
      "",
      "| Flow | Doc | Key areas | Last verified |",
      "| --- | --- | --- | --- |",
      "| Checkout | [checkout.md](checkout.md) | `src/checkout/` | 2026-10-01 |",
      "| Payment | [payment.md](payment.md) | `src/checkout/Pay.ts` | 2026-10-01 |",
      "",
      "## Other docs",
      "- [Architecture](../arch.md): overview",
      "",
    ].join("\n"),
  );
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "add clean flows"]);

  const res = scanFlowDrift({ repoRoot });
  assert.equal(res.status, "ok");
  assert.deepEqual(res.indexIssues, []);
  assert.deepEqual(res.unupdatedImpactedDocs, []);
  assert.equal(res.docs.length, 2);

  const checkout = res.docs.find((d) => d.docPath === "docs/flows/checkout.md");
  assert.ok(checkout);
  assert.equal(checkout.lastVerifiedDoc, "2026-10-01");
  assert.equal(checkout.lastVerifiedIndex, "2026-10-01");
  assert.deepEqual(checkout.keyFiles, ["src/checkout/Cart.ts", "src/checkout/Pay.ts", "tests/checkout.test.ts"]);
  assert.deepEqual(checkout.deadRefs, []);
  assert.deepEqual(checkout.issues, []);
  assert.equal(checkout.commitsTouchingKeyFiles, 0);
  assert.equal(checkout.driftScore, 0);
  assert.equal(checkout.diffStatus, "untouched");
});

test("T3: deleted key file, dead related flow, Last verified mismatch, missing indexed doc, and unindexed sibling doc compute exact 5 * issueCount", (t) => {
  const { repoRoot } = initRepo(t);
  writeRepoFile(repoRoot, "src/checkout/Cart.ts", "export const cart = 1;\n");
  writeRepoFile(repoRoot, "src/checkout/OldPay.ts", "export const oldPay = 1;\n");
  writeRepoFile(
    repoRoot,
    "docs/flows/checkout.md",
    [
      "# Checkout",
      "",
      "Last verified: 2026-09-15.",
      "",
      "## Key files",
      "| File | Role |",
      "| --- | --- |",
      "| `src/checkout/Cart.ts` | Cart |",
      "| `src/checkout/OldPay.ts` | Legacy payment |",
      "",
      "## Related flows",
      "- [Refund](refund.md)",
      "",
    ].join("\n"),
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/orphan.md",
    [
      "# Orphan",
      "",
      "Last verified: not yet",
      "",
      "## Key files",
      "| File | Role |",
      "| --- | --- |",
      "| `src/checkout/Cart.ts` | Cart |",
      "",
    ].join("\n"),
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    [
      "# Flow docs",
      "",
      "| Flow | Doc | Key areas | Last verified |",
      "| --- | --- | --- | --- |",
      "| Checkout | [checkout.md](checkout.md) | `src/checkout/` | 2026-10-01 |",
      "| Ghost | [ghost.md](ghost.md) | `src/ghost/` | 2026-10-01 |",
      "",
    ].join("\n"),
  );
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "initial docs"]);

  // Remove OldPay.ts without touching Cart.ts so commitsTouchingKeyFiles stays 0 for existing keyFiles
  unlinkSync(join(repoRoot, "src/checkout/OldPay.ts"));
  git(repoRoot, ["add", "-A"]);
  git(repoRoot, ["commit", "-m", "remove OldPay"]);

  const res = scanFlowDrift({ repoRoot });
  assert.equal(res.status, "ok");

  const issueKinds = res.indexIssues.map((i) => `${i.kind}:${i.doc}`).sort();
  assert.deepEqual(issueKinds, [
    "missing_indexed_doc:docs/flows/ghost.md",
    "unindexed_flow_doc:docs/flows/orphan.md",
    "verified_date_mismatch:docs/flows/checkout.md",
  ]);

  // checkout.md has 2 deadRefs + 1 verified_date_mismatch = 3 issues -> driftScore 15.0
  // orphan.md has 1 unindexed_flow_doc + 1 unverified_marker = 2 issues -> driftScore 10.0
  assert.deepEqual(
    res.docs.map((d) => ({ docPath: d.docPath, driftScore: d.driftScore })),
    [
      { docPath: "docs/flows/checkout.md", driftScore: 15 },
      { docPath: "docs/flows/orphan.md", driftScore: 10 },
    ],
  );

  const [checkout, orphan] = res.docs;
  assert.deepEqual(checkout.deadRefs, ["src/checkout/OldPay.ts", "docs/flows/refund.md"]);
  assert.deepEqual(checkout.issues, [
    "dead_ref:src/checkout/OldPay.ts",
    "dead_ref:docs/flows/refund.md",
    "verified_date_mismatch",
  ]);
  assert.deepEqual(orphan.issues, ["unindexed_flow_doc", "unverified_marker"]);
});

test("T4: counts Git ancestry commits touching key files after docLastCommit, handles untracked docs, and isolates GIT_DIR", (t) => {
  const { repoRoot } = initRepo(t);
  writeRepoFile(repoRoot, "src/auth/Login.ts", "export let v = 0;\n");
  writeRepoFile(
    repoRoot,
    "docs/flows/auth.md",
    "# Auth\n\nLast verified: 2026-10-01.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/auth/Login.ts` | Login |\n",
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    "# Flow docs\n\n| Flow | Doc | Key areas | Last verified |\n| --- | --- | --- | --- |\n| Auth | [auth.md](auth.md) | `src/auth/` | 2026-10-01 |\n| Draft | [draft.md](draft.md) | `src/auth/` | 2026-10-01 |\n",
  );
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "add auth flow"]);
  const docCommit = git(repoRoot, ["rev-parse", "HEAD"]);

  for (let i = 1; i <= 4; i++) {
    writeRepoFile(repoRoot, "src/auth/Login.ts", `export let v = ${i};\n`);
    git(repoRoot, ["add", "src/auth/Login.ts"]);
    git(repoRoot, ["commit", "-m", `auth change ${i}`]);
  }
  writeRepoFile(repoRoot, "README.md", "unrelated\n");
  git(repoRoot, ["add", "README.md"]);
  git(repoRoot, ["commit", "-m", "unrelated readme edit"]);

  // Untracked flow doc on disk
  writeRepoFile(
    repoRoot,
    "docs/flows/draft.md",
    "# Draft\n\nLast verified: 2026-10-01.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/auth/Login.ts` | Login |\n",
  );

  const cli = runCli(["--repo-root", repoRoot, "--json"], {
    GIT_DIR: "/nonexistent/git-dir",
    GIT_WORK_TREE: "/nonexistent/work-tree",
  });
  assert.equal(cli.status, 0, cli.stderr);
  const parsed = JSON.parse(cli.stdout);

  const auth = parsed.docs.find((d) => d.docPath === "docs/flows/auth.md");
  const draft = parsed.docs.find((d) => d.docPath === "docs/flows/draft.md");
  assert.equal(auth.docLastCommit, docCommit);
  assert.equal(auth.commitsTouchingKeyFiles, 4);
  assert.equal(auth.recentCommits.length, 4);
  assert.equal(auth.driftScore, 6.0);
  assert.equal(draft.docLastCommit, null);
  assert.equal(draft.commitsTouchingKeyFiles, 0);
  assert.equal(draft.driftScore, 0);
});

test("T5: --changed-from flags unupdated impacted docs for files, directories, and deleted key files without sibling prefix collisions", (t) => {
  const { repoRoot } = initRepo(t);
  writeRepoFile(repoRoot, "src/auth/Login.ts", "export const login = 1;\n");
  writeRepoFile(repoRoot, "src/billing/Charge.ts", "export const charge = 1;\n");
  writeRepoFile(repoRoot, "src/billing-v2/Experiment.ts", "export const exp = 1;\n");
  writeRepoFile(
    repoRoot,
    "docs/flows/auth.md",
    "# Auth\n\nLast verified: 2026-10-01.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/auth` | Auth package |\n",
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/billing.md",
    "# Billing\n\nLast verified: 2026-10-01.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/billing/Charge.ts` | Charge |\n| `src/billing` | Billing dir |\n",
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    "# Flow docs\n\n| Flow | Doc | Key areas | Last verified |\n| --- | --- | --- | --- |\n| Auth | [auth.md](auth.md) | `src/auth` | 2026-10-01 |\n| Billing | [billing.md](billing.md) | `src/billing` | 2026-10-01 |\n",
  );
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "base flows"]);

  git(repoRoot, ["checkout", "-b", "feature/oauth"]);
  writeRepoFile(repoRoot, "src/auth/OAuth.ts", "export const oauth = true;\n");
  writeRepoFile(repoRoot, "src/billing-v2/Experiment.ts", "export const exp = 2;\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "add oauth and billing-v2"]);

  const shadowCli = runCli(["--repo-root", repoRoot, "--changed-from", "main", "--json"]);
  assert.equal(shadowCli.status, 0, shadowCli.stderr);
  const shadowJson = JSON.parse(shadowCli.stdout);
  assert.deepEqual(shadowJson.unupdatedImpactedDocs, ["docs/flows/auth.md"]);
  assert.equal(shadowJson.docs.find((d) => d.docPath === "docs/flows/auth.md").diffStatus, "impacted_unupdated");
  assert.equal(shadowJson.docs.find((d) => d.docPath === "docs/flows/billing.md").diffStatus, "untouched");

  const strictCli = runCli(["--repo-root", repoRoot, "--changed-from", "main", "--fail-on-unupdated", "--json"]);
  assert.equal(strictCli.status, 1);

  // Update auth.md and delete billing key file without updating billing.md
  writeRepoFile(
    repoRoot,
    "docs/flows/auth.md",
    "# Auth\n\nLast verified: 2026-10-02.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/auth` | Auth + OAuth |\n",
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    "# Flow docs\n\n| Flow | Doc | Key areas | Last verified |\n| --- | --- | --- | --- |\n| Auth | [auth.md](auth.md) | `src/auth` | 2026-10-02 |\n| Billing | [billing.md](billing.md) | `src/billing` | 2026-10-01 |\n",
  );
  unlinkSync(join(repoRoot, "src/billing/Charge.ts"));
  git(repoRoot, ["add", "-A"]);
  git(repoRoot, ["commit", "-m", "update auth doc and delete Charge.ts"]);

  const afterDelete = scanFlowDrift({ repoRoot, changedFrom: "main" });
  assert.equal(afterDelete.docs.find((d) => d.docPath === "docs/flows/auth.md").diffStatus, "impacted_updated");
  assert.equal(afterDelete.docs.find((d) => d.docPath === "docs/flows/billing.md").diffStatus, "impacted_unupdated");
  assert.deepEqual(afterDelete.unupdatedImpactedDocs, ["docs/flows/billing.md"]);

  // Update billing.md too -> all impacted docs updated
  writeRepoFile(
    repoRoot,
    "docs/flows/billing.md",
    "# Billing\n\nLast verified: 2026-10-02.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/billing` | Billing dir |\n",
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    "# Flow docs\n\n| Flow | Doc | Key areas | Last verified |\n| --- | --- | --- | --- |\n| Auth | [auth.md](auth.md) | `src/auth` | 2026-10-02 |\n| Billing | [billing.md](billing.md) | `src/billing` | 2026-10-02 |\n",
  );
  git(repoRoot, ["add", "-A"]);
  git(repoRoot, ["commit", "-m", "update billing doc"]);

  const cleanStrict = runCli(["--repo-root", repoRoot, "--changed-from", "main", "--fail-on-unupdated", "--json"]);
  assert.equal(cleanStrict.status, 0, cleanStrict.stderr);
  assert.deepEqual(JSON.parse(cleanStrict.stdout).unupdatedImpactedDocs, []);

  // Human-readable output without --json
  const textCli = runCli(["--repo-root", repoRoot, "--changed-from", "main"]);
  assert.equal(textCli.status, 0, textCli.stderr);
  assert.match(textCli.stdout, /docs\/flows\/auth\.md/);

  // Two-dot fallback when comparing against an orphan branch with no merge-base
  git(repoRoot, ["checkout", "--orphan", "orphan-base"]);
  git(repoRoot, ["rm", "-rf", "."]);
  writeRepoFile(repoRoot, "src/auth/Login.ts", "export const login = 0;\n");
  writeRepoFile(
    repoRoot,
    "docs/flows/auth.md",
    "# Auth\n\nLast verified: 2026-09-01.\n\n## Key files\n| File | Role |\n| --- | --- |\n| `src/auth` | Auth package |\n",
  );
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    "# Flow docs\n\n| Flow | Doc | Key areas | Last verified |\n| --- | --- | --- | --- |\n| Auth | [auth.md](auth.md) | `src/auth` | 2026-09-01 |\n",
  );
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "orphan base"]);
  git(repoRoot, ["checkout", "feature/oauth"]);

  const twoDot = scanFlowDrift({ repoRoot, changedFrom: "orphan-base" });
  assert.equal(twoDot.diffMode, "two_dot");
});

test("T6: blocks path traversal, symlink escape, unknown CLI flags, and invalid or flag-injected git refs", (t) => {
  const { parent, repoRoot } = initRepo(t);
  // Create real files OUTSIDE repoRoot so naive existsSync(join(repoRoot, '../outside.ts')) would falsely succeed
  writeFileSync(join(parent, "outside.ts"), "export const secret = 1;\n", "utf8");
  writeFileSync(join(parent, "outside.md"), "# Secret\n", "utf8");

  writeRepoFile(repoRoot, "README.md", "# Repo root readme\n");
  writeRepoFile(repoRoot, "src/safe.ts", "export const safe = 1;\n");
  symlinkSync(join(parent, "outside.ts"), join(repoRoot, "src/escape-link.ts"));
  writeRepoFile(
    repoRoot,
    "docs/flows/security.md",
    [
      "# Security",
      "",
      "```markdown",
      "Last verified: 2099-01-01.",
      "```",
      "",
      "## Key files",
      "| File | Role |",
      "| --- | --- |",
      "| `src/safe.ts` | Safe file |",
      "| `../outside.ts` | Parent escape |",
      "| `../../etc/passwd` | System escape |",
      "| `src/escape-link.ts` | Symlink escape |",
      "",
      "## Related flows",
      "- [Outside](../../../outside.md)",
      "",
    ].join("\n"),
  );
  symlinkSync(join(repoRoot, "README.md"), join(repoRoot, "docs/flows/readme-link.md"));
  writeRepoFile(
    repoRoot,
    "docs/flows/INDEX.md",
    [
      "# Flow docs",
      "",
      "| Flow | Doc | Key areas | Last verified |",
      "| --- | --- | --- | --- |",
      "| Security | [security.md](security.md) | `src/` | 2026-10-01 |",
      "| Escape | [../../outside.md](../../outside.md) | `..` | 2026-10-01 |",
      "| ReadmeLink | [readme-link.md](readme-link.md) | `src/` | 2026-10-01 |",
      "",
    ].join("\n"),
  );
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "security fixture"]);

  const res = scanFlowDrift({ repoRoot });
  const sec = res.docs.find((d) => d.docPath === "docs/flows/security.md");
  assert.ok(sec);
  assert.equal(sec.lastVerifiedDoc, null);
  assert.ok(sec.issues.includes("unverified_marker"));
  assert.equal(res.docs.find((d) => d.docPath.endsWith("readme-link.md")), undefined);
  // None of the escaping/symlink targets may be treated as valid existing repo files
  assert.ok(sec.deadRefs.includes("../outside.ts"));
  assert.ok(sec.deadRefs.includes("../../etc/passwd"));
  assert.ok(sec.deadRefs.includes("src/escape-link.ts"));
  assert.equal(res.indexIssues.filter((i) => i.kind === "missing_indexed_doc").length, 2);

  // Invalid CLI / ref arguments exit 1
  assert.equal(runCli(["--unknown-flag"]).status, 1);
  assert.equal(runCli(["--repo-root", repoRoot, "--flows-dir", "../escape"]).status, 1);
  assert.equal(runCli(["--repo-root", repoRoot, "--changed-from", "--output=/tmp/evil"]).status, 1);
  assert.equal(runCli(["--repo-root", repoRoot, "--changed-from", "nonexistent-branch-ref"]).status, 1);
});
