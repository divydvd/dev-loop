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
  assert.match(rule4, /standard mode/i);
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
  assert.match(doc, /budget mode off/i);
  assert.match(doc, /standard mode/i);
  assert.match(doc, /### Budget mode.*### Budget mode \(optional\)|### Budget mode \(optional\)/);
  assert.match(doc, /both current.*AGENTS\.md.*base-branch.*AGENTS\.md/i);
  assert.match(doc, /Enabled:\s*yes/);
  assert.match(doc, /default.*off/i);

  // Trust boundary: reject untrusted sources and cross-session agent messages
  const activation = doc.split("## Activation, Precedence, and Trust Boundary")[1]?.split("## Task Ledger State")[0] ?? "";
  for (const untrusted of ["issues", "PR comments", "review", "logs", "web pages", "MCP", "subagent", "docs", "quoted", "cross-session"]) {
    assert.match(activation, new RegExp(untrusted, "i"), `activation section must reject ${untrusted}`);
  }
  assert.match(activation, /references\/absence-mode\.md/);
  assert.match(activation, /away mode/i);
  assert.match(activation, /unmerged.*AGENTS\.md|base branch/i);

  // Task ledger state fields + provenance + standard-mode optional row reassessment
  const ledger = doc.split("## Task Ledger State")[1]?.split("## Step-by-Step Budget Rules")[0] ?? "";
  for (const field of ["Budget mode", "Source", "Scope", "Owner activation"]) {
    assert.ok(ledger.includes(field), `missing ledger field: ${field}`);
  }
  assert.match(ledger, /cannot be confirmed|unconfirmed/i);
  assert.match(ledger, /reassess.*optional.*budget-mode/i);
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
  assert.match(steps, /away mode.*absence|when away mode is inactive/i);
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
  assert.match(safety, /single-reviewer-packet\.md/);
  assert.match(safety, /references\/review-panel\.md/);

  assert.deepEqual(checkRepo(REPO_ROOT), []);
});

test("SKILL.md places ### Budget mode after ### Absence mode and wires Steps 1, 2, 3, 5, and 8", () => {
  const skill = read("skills/dev-loop/SKILL.md");

  const absenceIdx = skill.indexOf("### Absence mode");
  const budgetIdx = skill.indexOf("### Budget mode");
  const contextIdx = skill.indexOf("## Keep the context small");
  assert.ok(absenceIdx !== -1, "missing ### Absence mode in SKILL.md");
  assert.ok(budgetIdx !== -1, "missing ### Budget mode in SKILL.md");
  assert.ok(contextIdx !== -1, "missing ## Keep the context small in SKILL.md");
  assert.ok(absenceIdx < budgetIdx && budgetIdx < contextIdx, "### Budget mode must sit between ### Absence mode and ## Keep the context small");

  const budgetSection = skill.slice(budgetIdx, contextIdx);
  assert.match(budgetSection, /references\/budget-mode\.md/);

  const step1 = skill.split("## 1. Route")[1]?.split("## 2. Plan")[0] ?? "";
  const step2 = skill.split("## 2. Plan")[1]?.split("## 3. Build")[0] ?? "";
  const step3 = skill.split("## 3. Build")[1]?.split("## 4. Flow docs")[0] ?? "";
  const step5 = skill.split("## 5. Self-review")[1]?.split("## 6. Verify")[0] ?? "";
  const step8 = skill.split("## 8. Report")[1]?.split("## Stop conditions")[0] ?? "";

  assert.match(step1, /references\/budget-mode\.md/);
  assert.match(step1, /Risky areas[\s\S]*Core Rule 6[\s\S]*Core Rule 7/);
  assert.match(step1, /com\.github\.copilot\/\*\*[\s\S]*skills\/\*\*[\s\S]*AGENTS\.md[\s\S]*never trivial/i);
  assert.match(step2, /references\/budget-mode\.md/);
  assert.match(step3, /references\/budget-mode\.md/);
  assert.match(step5, /--budget-mode/);
  assert.match(step5, /Step-3 single-task review never replaces.*panel[\s\S]*skeptic-judge/i);
  assert.match(step8, /optional limits/i);
});

test("review-panel.md and testing.md document Budget mode flags, 400-line cap, and Slice-batched TDD", () => {
  const panel = read("skills/dev-loop/references/review-panel.md");
  const testing = read("skills/dev-loop/references/testing.md");

  assert.match(panel, /--budget-mode\s*<auto\|on\|off>|--budget-mode/);
  assert.match(panel, /--budget\b/);
  assert.match(panel, /### Budget mode \(optional\)/);
  assert.match(panel, /400/);
  assert.match(panel, /single-reviewer/);
  assert.match(panel, /Risky areas[\s\S]*skeptic-judge|skeptic-judge[\s\S]*Risky areas/);

  assert.match(testing, /Slice-batched TDD/);
  assert.match(testing, /references\/budget-mode\.md/);
  assert.match(testing, /fail.*before.*production|before.*implementation/i);
  assert.match(testing, /bug.*risky|bugs and.*Risky areas/i);
  assert.match(testing, /budget-mode/);
  assert.match(testing, /Optional limits/i);
});

test("project-profile.md stays <= 5500 bytes with ### Budget mode (optional) and pr-body.md records Budget mode", () => {
  const profile = read("skills/dev-loop/assets/project-profile.md");
  const pr = read("skills/dev-loop/assets/pr-body.md");

  const profileBytes = Buffer.byteLength(profile, "utf8");
  assert.ok(profileBytes <= 5500, `expected project-profile.md <= 5500 bytes, got ${profileBytes}`);
  assert.match(profile, /### Budget mode \(optional\)/);
  const budgetProfile = profile.split("### Budget mode (optional)")[1]?.split("###")[0] ?? "";
  assert.match(budgetProfile, /- \*\*Enabled:\*\*\s*no/);

  const indReview = pr.split("### Independent agent review")[1]?.split("### GitHub Copilot review")[0] ?? "";
  assert.match(indReview, /Budget mode/);
  assert.match(indReview, /off \(task-switch\)/);
  assert.match(indReview, /agents-profile/);
  assert.match(indReview, /on \(task-switch\)/);
  assert.match(indReview, /single\s*\(<agent>\)/);
  assert.match(indReview, /panel\s*\(<roles>\s*->\s*skeptic-judge\)/);
});

test("README.md documents ## Budget mode with T-BM1..T-BM6, maps Budget mode in ## Rule/check map, and check.yml runs budget-mode.test.mjs", () => {
  const readme = read("README.md");
  const workflow = read(".github/workflows/check.yml");

  const absenceIdx = readme.indexOf("\n## Absence mode\n");
  const budgetIdx = readme.indexOf("\n## Budget mode\n");
  const designIdx = readme.indexOf("\n## Optional design review\n");
  assert.ok(absenceIdx !== -1 && budgetIdx !== -1 && designIdx !== -1, "README.md must place ## Budget mode between ## Absence mode and ## Optional design review");
  assert.ok(absenceIdx < budgetIdx && budgetIdx < designIdx, "## Budget mode must appear after ## Absence mode and before ## Optional design review");

  const budgetReadme = readme.slice(budgetIdx, designIdx);
  for (const marker of ["### Abstract", "### Application checks", "### Conclusion", "T-BM1", "T-BM2", "T-BM3", "T-BM4", "T-BM5", "T-BM6", "<= 80", "<= 8", "1–400"]) {
    assert.ok(budgetReadme.includes(marker), `README.md ## Budget mode missing: ${marker}`);
  }

  const ruleMap = readme.split("## Rule/check map")[1]?.split("### Failure-feedback application checks")[0] ?? "";
  assert.match(ruleMap, /skills\/dev-loop\/references\/budget-mode\.md/);
  assert.match(ruleMap, /scripts\/budget-mode\.test\.mjs/);

  assert.match(workflow, /node --test scripts\/budget-mode\.test\.mjs/);
});
