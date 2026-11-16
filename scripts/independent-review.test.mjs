import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};
const core = read("com.github.copilot/rules/core.mdc");
const skill = read("skills/dev-loop/SKILL.md");
const panel = read("skills/dev-loop/references/review-panel.md");
const testing = read("skills/dev-loop/references/testing.md");
const pr = read("skills/dev-loop/assets/pr-body.md");
const acceptance = read("skills/dev-loop/assets/acceptance-record.md");

test("the core requires independent review before substantive PR readiness", () => {
  assert.match(core, /independent agent review.*each substantive PR.*ready/i);
  assert.match(core, /harmless spelling or formatting/i);
  assert.match(core, /GitHub Copilot review.*not.*replace/i);
});

test("review scope includes small changes and operational instructions", () => {
  const review = skill.split("## 5. Self-review")[1]?.split("## 6. Verify")[0] ?? "";
  assert.doesNotMatch(review, /plan from step 2/i);
  assert.match(review, /small features and small fixes/i);
  for (const area of ["code", "tests", "configuration", "dependencies", "workflows", "rules", "skills", "operational instructions"]) {
    assert.ok(review.includes(area), `missing review scope: ${area}`);
  }
  assert.match(skill, /changed command.*not trivial/i);
});

test("existing coverage is reused without hiding integration or later changes", () => {
  assert.match(skill, /existing.*review.*complete.*diff.*interactions/i);
  assert.match(skill, /isolated task reviews.*not.*integration/i);
  assert.match(skill, /later substantive changes.*focused independent review/i);
  assert.match(skill, /harmless.*edits.*do not.*another review/i);
});

test("review failure permits publication but not a ready claim", () => {
  assert.match(skill, /fails again.*not.*ready/i);
  const done = skill.split("- **Done:**")[1]?.split("\n")[0] ?? "";
  assert.match(done, /independent review coverage.*harmless.edit exemption/i);
  assert.match(acceptance, /independent review coverage.*harmless.edit exemption/i);
});

test("the PR records independent and automatic review separately", () => {
  assert.match(pr, /Independent agent review/);
  for (const field of ["Reviewer", "Reviewed commit", "Scope", "Verdict", "Changes after review", "Exemption"]) {
    assert.ok(pr.includes(field), `missing review field: ${field}`);
  }
  assert.match(pr, /single\s*\(<agent>\)/);
  assert.match(pr, /panel\s*\(<roles>\s*->\s*skeptic-judge\)/);
  assert.match(pr, /GitHub Copilot review/);
  assert.match(skill, /review_clean.*does not.*prove independent/i);
});

test("step 5 wires the deterministic review panel router and reference", () => {
  const review = skill.split("## 5. Self-review")[1]?.split("## 6. Verify")[0] ?? "";
  assert.match(review, /scripts\/prepare-review-panel\.mjs/);
  assert.match(review, /references\/review-panel\.md/);
  assert.match(review, /--out-dir/);
  assert.ok(panel.length > 0, "missing skills/dev-loop/references/review-panel.md");
  for (const role of ["single-reviewer", "arch-correctness", "concurrency-state", "security-privacy", "ui-a11y", "skeptic-judge"]) {
    assert.ok(panel.includes(role), `missing panel role: ${role}`);
  }
  for (const field of ["id", "severity", "domain", "file", "lines", "symptom", "evidence", "suggestedFix", "missingTestCases"]) {
    assert.ok(panel.includes(`"${field}"`), `missing JSON schema field: ${field}`);
  }
  assert.match(panel, /dispatch:\s*sequential/);
  assert.match(panel, /open, not ready: independent review unavailable/);
  assert.match(panel, /Not reviewed/);
  assert.match(panel, /Advocate filter/i);
  assert.match(panel, /Skeptic gap check/i);
  assert.match(testing, /no separate reviewer for each small non-risky task/i);
  assert.match(testing, /references\/review-panel\.md/);
});

test("CI runs the independent review regression suite", () => {
  assert.match(read(".github/workflows/check.yml"), /node --test scripts\/independent-review\.test\.mjs/);
});
