import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkRepo, stripFrontmatter } from "./check.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relPath) => {
  const full = join(REPO_ROOT, relPath);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
};

test("core.mdc wires budget-mode.md in Rule 4, stays within startup limits, and matches dev-loop-context.md", () => {
  const core = read("com.github.copilot/rules/core.mdc");
  const agents = read("AGENTS.md");
  const geminiMirror = read("dev-loop-context.md");

  const lineCount = core.trimEnd().split(/\r?\n/).length;
  assert.ok(lineCount <= 60, `expected core.mdc <= 60 lines, got ${lineCount}`);

  const startupBytes = Buffer.byteLength(agents, "utf8") + Buffer.byteLength(core, "utf8");
  assert.ok(startupBytes <= 15_000, `expected AGENTS.md + core.mdc <= 15000 bytes, got ${startupBytes}`);

  const rule4 = core.split("4. Ask only real doubts.")[1]?.split("## The owner's standing answers")[0] ?? "";
  assert.match(rule4, /skills\/dev-loop\/references\/budget-mode\.md/);
  assert.match(rule4, /budget mode/i);
  assert.match(rule4, /budget mode off/i);
  assert.match(rule4, /AGENTS\.md/);
  assert.match(rule4, /approvals.*required test tiers.*risky-area panels.*independent review/i);

  assert.equal(geminiMirror, stripFrontmatter(core), "dev-loop-context.md must equal stripFrontmatter(core.mdc)");
});

test("budget-mode.md defines precedence, trust boundary, away-mode orthogonality, and task ledger state", () => {
  const doc = read("skills/dev-loop/references/budget-mode.md");
  assert.ok(doc.length > 0, "skills/dev-loop/references/budget-mode.md must exist");

  for (const heading of [
    "## Abstract",
    "## Activation, Precedence, and Trust Boundary",
    "## Task Ledger State",
    "## Step-by-Step Budget Rules",
    "## Slice-Batched TDD Contract",
    "## Non-Negotiable Safety Gates",
    "## Conclusion",
  ]) {
    assert.ok(doc.includes(heading), `missing heading: ${heading}`);
  }

  // Precedence order
  assert.match(doc, /budget mode off|standard mode/i);
  assert.match(doc, /### Budget mode \(optional\)/);
  assert.match(doc, /Enabled:\s*yes/);
  assert.match(doc, /default.*off/i);

  // Trust boundary: reject untrusted sources and cross-session agent messages
  const activation = doc.split("## Activation, Precedence, and Trust Boundary")[1]?.split("## Task Ledger State")[0] ?? "";
  for (const untrusted of ["issues", "PR comments", "review", "logs", "docs", "quoted", "cross-session"]) {
    assert.match(activation, new RegExp(untrusted, "i"), `activation section must reject ${untrusted}`);
  }
  assert.match(activation, /references\/absence-mode\.md/);
  assert.match(activation, /away mode/i);
  assert.match(activation, /unmerged.*AGENTS\.md|base branch/i);

  // Task ledger state fields
  const ledger = doc.split("## Task Ledger State")[1]?.split("## Step-by-Step Budget Rules")[0] ?? "";
  for (const field of ["Budget mode", "Source", "Scope"]) {
    assert.ok(ledger.includes(field), `missing ledger field: ${field}`);
  }
});

test("budget-mode.md specifies 1x model guidance, Step 1-5 cost rules, slice-batched TDD, and non-negotiable gates", () => {
  const doc = read("skills/dev-loop/references/budget-mode.md");

  // 1x model guidance + >3x tip + no high-multiplier subagent overrides
  for (const model of ["claude-sonnet-5.5", "gpt-6.1-sol", "gemini-4-carbon", "gpt-6-luna"]) {
    assert.ok(doc.includes(model), `missing 1x model example: ${model}`);
  }
  assert.match(doc, />3x|3x/);
  assert.match(doc, /do not pass.*high-multiplier.*model|never override.*subagent.*model/i);

  // Step 1-5 rules
  const steps = doc.split("## Step-by-Step Budget Rules")[1]?.split("## Slice-Batched TDD Contract")[0] ?? "";
  assert.match(steps, /ask_user/);
  assert.match(steps, /single.*round|one.*turn|batch/i);
  assert.match(steps, /builder-check|builder check/i);
  assert.match(steps, /design-review/);
  assert.match(steps, /80.*lines|<= 80/);
  assert.match(steps, /3[–-]6/);
  assert.match(steps, /Optional limits/);
  assert.match(steps, /executing-plans/);
  assert.match(steps, /8 tasks|<= 8/);
  assert.match(steps, /references\/milestones\.md/);
  assert.match(steps, /--budget-mode on/);
  assert.match(steps, /--budget-mode off/);
  assert.match(steps, /400/);

  // Slice-batched TDD contract
  const tdd = doc.split("## Slice-Batched TDD Contract")[1]?.split("## Non-Negotiable Safety Gates")[0] ?? "";
  assert.match(tdd, /watch.*fail.*before.*production code|fail.*before.*writing.*production code/i);
  assert.match(tdd, /bug.*Risky areas|bugs and.*Risky areas/i);
  assert.match(tdd, /reproduce.*first|single-fault/i);

  // Non-negotiable safety gates + baseline loophole closures
  const safety = doc.split("## Non-Negotiable Safety Gates")[1]?.split("## Conclusion")[0] ?? "";
  assert.match(safety, /Core Rule 5|design approval/i);
  assert.match(safety, /Core Rule 6|risky.*plan/i);
  assert.match(safety, /Core Rule 7|per-task.*review/i);
  assert.match(safety, /test tier/i);
  assert.match(safety, /device test/i);
  assert.match(safety, /flow doc/i);
  assert.match(safety, /Core Rule 23|independent.*review/i);
  assert.match(safety, /Core Rule 21|merge/i);
  assert.match(safety, /Step-3.*never.*replace.*panel|single-task review.*never.*replace.*panel/i);

  assert.deepEqual(checkRepo(REPO_ROOT), []);
});
