import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const core = read("com.github.copilot/rules/core.mdc");
const skill = read("skills/dev-loop/SKILL.md");
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
  assert.match(pr, /GitHub Copilot review/);
  assert.match(skill, /review_clean.*does not.*prove independent/i);
});
