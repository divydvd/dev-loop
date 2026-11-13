import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};
const skill = read("skills/dev-loop/SKILL.md");
const guidance = read("skills/dev-loop/references/testing.md");
const matrix = read("skills/dev-loop/assets/test-matrix.md");
const acceptance = read("skills/dev-loop/assets/acceptance-record.md");
const pr = read("skills/dev-loop/assets/pr-body.md");
const regression = read("skills/dev-loop/assets/regression-matrix.md");
const profile = read("skills/dev-loop/assets/project-profile.md");
const milestones = read("skills/dev-loop/references/milestones.md");

test("milestone guidance resolves from routing, planning, execution, and reporting", () => {
  assert.ok(milestones, "missing milestone reference");
  for (const [heading, end] of [
    ["## 1. Route", "## 2. Plan"], ["## 2. Plan", "## 3. Build"],
    ["## 3. Build", "## 4. Flow docs"], ["## 8. Report", "## Stop conditions"],
  ]) {
    const section = skill.split(heading)[1]?.split(end)[0] ?? "";
    assert.match(section, /references\/milestones\.md/, `missing wiring: ${heading}`);
  }
});

test("milestone records connect acceptance, evidence, and PR scope", () => {
  for (const field of [
    "Milestone selection", "Milestone ID", "Observable result", "Acceptance checks",
    "Dependencies", "Branch / base", "Remaining behavior", "Status",
    "Tested / reviewed identity", "PR / next action",
  ]) {
    assert.ok(acceptance.includes(field), `missing milestone slot: ${field}`);
  }
  for (const field of ["Milestone ID", "Delivered scope", "Remaining scope", "Dependencies"]) {
    assert.ok(pr.includes(field), `missing PR milestone slot: ${field}`);
  }
  assert.match(acceptance, /optional.*multi.milestone/i);
});

test("milestone readiness preserves whole-assignment gaps and merge boundaries", () => {
  assert.match(milestones, /independent PRs.*integration base/i);
  assert.match(milestones, /stack.*real.*dependenc/i);
  assert.match(milestones, /current.*head/i);
  assert.match(milestones, /typed.*approval/i);
  assert.match(milestones, /required.*integration.*checks/i);
  assert.match(milestones, /global.*stop/i);
  assert.match(milestones, /overall assignment.*milestone/i);
  assert.match(milestones, /no eligible work.*save.*stop/i);
});

test("copied acceptance records preserve normal-mode milestone continuation", () => {
  const blocked = acceptance.split("  - Blocked:")[1]?.split("\n\n")[0] ?? "";
  assert.match(blocked, /approved multi.milestone assignment/);
  assert.match(blocked, /references\/milestones\.md/);
  assert.match(blocked, /actual dependents.*eligible independent work/);
  assert.match(blocked, /Global safety stops.*three failed fixes.*stop/);
});

// These checks protect instruction wiring. Fresh consuming agents test instruction use.
test("substantive routes load testing guidance before implementation", () => {
  const start = skill.split("## Before you start")[1]?.split("### Absence mode")[0] ?? "";
  assert.match(start, /references\/testing\.md/);
  assert.match(start, /before implementation/i);
  for (const route of ["small feature", "small bug", "larger plan"]) {
    assert.ok(start.includes(route), `missing route: ${route}`);
  }
  assert.match(start, /question.*harmless spelling.*formatting.*exempt/i);
});

test("planning selects proportional detail by impact, not diff size", () => {
  assert.match(guidance, /compact.*acceptance record/i);
  assert.match(guidance, /complex.*high.risk.*detailed/i);
  assert.match(guidance, /impact.*not.*line count/i);
  assert.match(acceptance, /Test matrix/);
  assert.match(acceptance, /before implementation/i);
  assert.match(guidance, /no new owner approval gate/i);
});

test("the matrix links requirements and risks to executable cases", () => {
  for (const field of [
    "Case", "Requirement / risk", "Required?", "Setup / input", "Expected result",
    "Method", "Test location", "Status", "Evidence", "Tested identity",
  ]) {
    assert.ok(matrix.includes(field), `missing case field: ${field}`);
  }
  assert.match(matrix, /Detailed cases/);
  assert.match(matrix, /Category assessment/);
  assert.match(matrix, /Exclusion reason/);
  assert.match(guidance, /each acceptance condition.*important.*risk.*case.*gap/i);
});

test("risk selection includes state, consumer, and failure boundaries", () => {
  for (const category of [
    "boundaries", "invalid input", "permissions", "state changes", "concurrency",
    "retries", "partial failure", "recovery", "existing consumers", "UI",
    "accessibility", "device", "migration", "performance",
  ]) {
    assert.ok(guidance.includes(category), `missing category: ${category}`);
  }
  assert.match(guidance, /reuse existing tests/i);
  assert.match(guidance, /exclusions.*reason/i);
});

test("build and independent review reassess cases against actual consumers", () => {
  const build = skill.split("## 3. Build")[1]?.split("## 4. Flow docs")[0] ?? "";
  const review = skill.split("## 5. Self-review")[1]?.split("## 6. Verify")[0] ?? "";
  assert.match(build, /affected cases.*evidence/i);
  assert.match(review, /requirements.*source.*consumers.*missing cases/i);
  assert.match(guidance, /existing independent review/i);
  assert.match(guidance, /no separate reviewer/i);
});

test("case evidence preserves execution status and original identity", () => {
  for (const status of ["passed", "failed", "blocked", "not run", "not applicable"]) {
    assert.ok(guidance.includes(status), `missing status: ${status}`);
  }
  assert.match(guidance, /matrix.*not.*execution evidence/i);
  assert.match(guidance, /not relabel.*old.*new.commit/i);
  assert.match(guidance, /project.*tiers/i);
  assert.match(guidance, /TDD/);
});

test("required gaps block ready claims while optional limits remain explicit", () => {
  assert.match(guidance, /required.*failed.*blocked.*not run/i);
  assert.match(guidance, /required coverage gap.*not ready/i);
  assert.match(guidance, /not.*required.*optional.*fails/i);
  assert.match(guidance, /absence.*dependents/i);
  assert.match(acceptance, /required.*coverage gap/i);
  assert.match(pr, /Test coverage/);
  assert.match(pr, /Required blockers/);
  assert.match(pr, /Optional limits/);
  assert.match(skill.split("## Stop conditions")[1] ?? "", /required cases.*coverage gaps/i);
});

test("CI runs the testing contract alongside existing suites", () => {
  const workflow = read(".github/workflows/check.yml");
  for (const suite of ["testing-contract", "independent-review", "branch-maintenance", "device-handoff"]) {
    assert.ok(workflow.includes(`node --test scripts/${suite}.test.mjs`), `missing CI suite: ${suite}`);
  }
});

test("ready gates permit only justified inapplicable required cases", () => {
  const done = skill.split("- **Done:**")[1]?.split("\n")[0] ?? "";
  for (const gate of [done, acceptance]) {
    assert.match(gate, /all applicable required cases pass/i);
    assert.match(gate, /not applicable.*source.*requirements.*reason/i);
  }
  assert.match(guidance, /not.*required case not applicable unless source or requirements/i);
  assert.match(guidance, /not applicable.*not a pass/i);
});

test("the permanent inventory template separates flow definitions from run evidence", () => {
  for (const field of [
    "Case ID", "Flow / expected result", "Source / consumers", "Level / triggers",
    "Test / procedure", "Environment / safe data",
  ]) {
    assert.ok(regression.includes(field), `missing permanent field: ${field}`);
  }
  assert.match(regression, /stable.*IDs/i);
  assert.match(regression, /no.*permanent.*passed/i);
  assert.match(regression, /task.*evidence/i);
});

test("project profiles locate the inventory and define additive selection levels", () => {
  assert.match(profile, /Regression matrix/);
  assert.match(profile, /Matrix path/);
  assert.match(profile, /Core checks/);
  assert.match(profile, /Affected-area checks/);
  assert.match(profile, /Broad triggers/);
  assert.match(guidance, /core.*substantive code PR/i);
  assert.match(guidance, /core and affected cases in broad selection|broad.*core.*affected/i);
  assert.match(guidance, /not.*line.count/i);
  assert.match(guidance, /do not replace.*project.*tiers/i);
});

test("discovery reuses project records and reports absent or stale coverage honestly", () => {
  assert.match(guidance, /existing.*testing.*docs/i);
  assert.match(guidance, /docs\/testing\/regression-matrix\.md/);
  assert.match(guidance, /missing.*inventory.*gap/i);
  assert.match(guidance, /do not invent.*suite/i);
  assert.match(guidance, /stale.*test.*reference/i);
  assert.match(guidance, /source.*tests.*consumers/i);
});

test("feature and bug work maintains persistent cases without convenient retirement", () => {
  assert.match(guidance, /same PR/i);
  assert.match(guidance, /new.*important.*flow/i);
  assert.match(guidance, /bug.*regression/i);
  assert.match(guidance, /retire.*requirements.*source/i);
  assert.match(guidance, /do not reuse.*ID/i);
  assert.match(guidance, /not.*retire.*fails.*blocked/i);
  assert.match(regression, /Retired cases/);
});

test("permanent case IDs connect selection and maintenance to task records and review", () => {
  for (const record of [acceptance, matrix, pr]) {
    assert.match(record, /Regression selection/);
    assert.match(record, /case IDs/i);
  }
  assert.match(skill, /assets\/regression-matrix\.md/);
  assert.match(skill, /permanent.*inventory/i);
  assert.match(guidance, /review.*omitted.*flows/i);
  assert.match(guidance, /one.*command.*multiple.*IDs/i);
});

test("owner reports lead with overall readiness before partial results", () => {
  const report = skill.split("## 8. Report")[1]?.split("## Stop conditions")[0] ?? "";
  assert.match(report, /first sentence.*overall.*readiness/i);
  assert.match(report, /passed scope/i);
  assert.match(report, /required gaps/i);
  assert.match(report, /next action/i);
  assert.match(report, /tested.*published.*identit/i);
});

test("failure handoffs distinguish product evidence from blocked test execution", () => {
  assert.match(guidance, /## Failure handoff/);
  const handoff = guidance.split("## Failure handoff")[1]?.split("## Verify and report")[0] ?? "";
  assert.match(handoff, /product failure.*tool failure.*environment blocker/i);
  assert.match(handoff, /unknown.*cause|cause.*unknown/i);
  assert.match(handoff, /not run.*not.*product failure/i);
  assert.match(handoff, /recovery.*access/i);
  assert.match(handoff, /next.*check.*prerequisite/i);
  assert.match(handoff, /full.*run.*recovery evidence/i);
});

test("verification routes failed checks through the existing evidence handoff", () => {
  const verify = skill.split("## 6. Verify")[1]?.split("## 7. Ship")[0] ?? "";
  assert.match(verify, /failure handoff.*references\/testing\.md/i);
  assert.match(verify, /product failure/i);
  assert.match(verify, /tool.*environment/i);
  assert.match(verify, /recovered prerequisite/i);
});

test("infra review assigns improvement layers without inventing a confirmed cause", () => {
  const infra = read("skills/infra-review/SKILL.md");
  for (const layer of ["Environment", "Verification", "Coordination"]) {
    assert.match(infra, new RegExp(`\\| ${layer} \\|`));
  }
  assert.match(infra, /unknown.*cause|cause.*unknown/i);
  assert.match(infra, /primary.*layer/i);
  assert.match(infra, /incident.*reference/i);
  assert.match(infra, /measurable expected result/i);
  assert.match(infra, /2 or more occurrences/);
  assert.match(infra, /shadow mode for a week/);
});

test("failed attempts preserve expected and observed evidence before another attempt", () => {
  const handoff = guidance.split("## Failure handoff")[1]?.split("## Verify and report")[0] ?? "";
  for (const field of ["Expected result", "Actual result", "Attempted change", "New evidence"]) {
    assert.ok(handoff.includes(field), `missing failed-attempt field: ${field}`);
  }
  assert.match(handoff, /same result.*no new evidence/i);
  assert.match(handoff, /diagnos/i);
  assert.match(handoff, /2 failed fixes.*3/i);
  assert.match(handoff, /does not reset/i);
  assert.match(handoff, /before another attempt/i);
});

test("the rule check map resolves executable references and states enforcement limits", () => {
  const section = read("README.md").split("## Rule/check map")[1]?.split(/\n#{2,3} /)[0] ?? "";
  assert.match(section, /\| Rule \| Check location \| Regression test \| Known limitation \|/);
  const rows = section.split("\n").filter((line) => /^\| (?!Rule|---)/.test(line));
  assert.ok(rows.length >= 3, "missing selected rules");
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 4);
    assert.ok(cells.every(Boolean), "incomplete map row");
    for (const cell of cells.slice(1, 3)) {
      const links = [...cell.matchAll(/\]\(([^)]+)\)/g)];
      assert.ok(links.length, "check and regression cells need repository links");
      for (const [, path] of links) {
        assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `stale map reference: ${path}`);
      }
    }
    const regression = [...cells[2].matchAll(/\]\(([^)]+\.test\.mjs)\)/g)][0];
    assert.ok(regression, "regression must link to an actual test suite");
    assert.match(read(regression[1]), /\btest\(/);
  }
  assert.match(section, /does not load.*work-ledger/i);
  assert.match(section, /not.*live.*enforcement|live.*activation.*not/i);
  assert.match(section, /structural/i);
});

test("infra review uses the existing map before adding an automatic check", () => {
  const infra = read("skills/infra-review/SKILL.md");
  assert.match(infra, /README\.md#rulecheck-map/);
  assert.match(infra, /enforcement point/i);
  assert.match(infra, /regression test/i);
  assert.match(infra, /known limitation/i);
  assert.match(infra, /live.*activat/i);
});
