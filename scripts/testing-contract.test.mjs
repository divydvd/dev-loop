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
  for (const suite of ["testing-contract", "scan-flow-drift", "independent-review", "branch-maintenance", "device-handoff", "collect-metrics", "mine-pr-evidence", "run-benchmark", "portability-contract"]) {
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

test("infra review runs the objective telemetry collector in shadow mode", () => {
  const infra = read("skills/infra-review/SKILL.md");
  assert.match(infra, /node .*scripts\/collect-metrics\.mjs/);
  assert.match(infra, /shadow mode/i);
  assert.match(infra, /14.*day.*survival|survival.*14.*day/i);
  assert.match(infra, /work-ledger.*docs-only|docs-only.*work-ledger/i);
  for (const route of ["trivial", "small", "multi-task"]) {
    assert.ok(infra.includes(route), `missing route bucket: ${route}`);
  }
  assert.match(infra, /totalNanoAiu/);
  assert.match(infra, /ambiguous/i);
});

test("infra review enforces the 90% quality floor, route-cost priority, and 4-week non-safety pruning guards", () => {
  const choose = read("skills/infra-review/SKILL.md").split("## 4. Choose the changes")[1]?.split("## 5. Output")[0] ?? "";
  assert.match(choose, /Durable first-pass yield/);
  assert.match(choose, /90\.0%|90%/);
  assert.match(choose, /totalNanoAiu/);
  assert.match(choose, /4 consecutive/i);
  assert.match(choose, /non-safety/i);
  assert.match(choose, /never.*prune|do not.*prune|preserve.*safety/i);
  assert.match(choose, /n\/a.*unavailable|unavailable.*n\/a/i);
});

test("README documents the executable benchmark runner and maps its anti-tampering checks", () => {
  const readme = read("README.md");
  assert.match(readme, /scripts\/run-benchmark\.mjs/);
  assert.match(readme, /scripts\/run-benchmark\.test\.mjs/);
  assert.match(readme, /--baseline/);
  assert.match(readme, /--candidate/);
  for (const id of ["B1-small-bug", "B2-trivial-typo", "B3-tdd-feature", "B4-flow-doc-sync", "B5-safety-no-rebase", "B6-blocked-stop-limit"]) {
    assert.ok(readme.includes(id), `missing benchmark task in README: ${id}`);
  }
});

test("infra review defines 5-box active work time, parallelismFactor, and quality-gated speed bottleneck selection", () => {
  const infra = read("skills/infra-review/SKILL.md");
  for (const field of ["activeSec", "humanWaitSec", "parallelismFactor", "modelSec", "buildTestSec", "pollSec", "subagentSec", "ioOtherSec", "dominantBottleneck"]) {
    assert.ok(infra.includes(field), `missing speed telemetry field in infra-review SKILL.md: ${field}`);
  }
  const choose = infra.split("## 4. Choose the changes")[1]?.split("## 5. Output")[0] ?? "";
  assert.match(choose, /dominantBottleneck/);
  assert.match(choose, /parallelismFactor/);
  const readme = read("README.md");
  assert.ok(readme.includes("T-IR7"), "README must document T-IR7 speed application check");
});

test("T-IR8: infra review and project profile are host-aware across Copilot, Claude Code, and Gemini CLI", () => {
  const infra = read("skills/infra-review/SKILL.md");
  const collect = infra.split("## 1. Collect")[1]?.split("## 2. Measure")[0] ?? "";
  const measure = infra.split("## 2. Measure")[1]?.split("## 3. Find the faults")[0] ?? "";
  const output = infra.split("## 5. Output")[1] ?? "";

  // Step 1.1: active-host refresh commands + source checkout verification
  assert.ok(collect.includes("copilot plugin update dev-loop@dev-loop"));
  assert.ok(collect.includes("claude plugin update dev-loop@dev-loop"));
  assert.ok(collect.includes("gemini extensions update dev-loop"));
  assert.match(collect, /origin\/main/);

  // Step 1.2: multi-host repo discovery
  assert.ok(collect.includes(".github/copilot/settings.json"));
  assert.ok(collect.includes(".claude/settings.json"));
  assert.match(collect, /gemini.*extension|\.gemini/i);

  // Step 2: 17-row table preserved, per-host startup KB (highest active host), matched-Copilot-only session telemetry, Copilot-only work-ledger
  const mainTable = measure.split("### Shadow-mode objective telemetry")[0] ?? "";
  const dataRows = mainTable.split("\n").filter((line) => /^\| (?!Measure|---)/.test(line));
  assert.equal(dataRows.length, 17, "infra-review main table must keep all 17 rows");
  assert.match(measure, /CLAUDE\.md/);
  assert.match(measure, /SessionStart/);
  assert.match(measure, /GEMINI\.md/);
  assert.match(measure, /highest active host/i);
  assert.ok(measure.includes("unmatched_non_copilot_or_missing_session"));
  assert.match(measure, /Owner repeat-rule messages.*n\/a \(unmatched_non_copilot_or_missing_session\)/i);
  assert.match(measure, /sessions_unavailable|status: "unavailable"|n\/a \(unavailable\)/);
  assert.match(measure, /ledger.*fix-up|prerequisite|ledger_unavailable/i);
  assert.match(measure, /work-ledger.*Copilot-only|Copilot-only.*work-ledger/i);
  assert.match(measure, /instructions only/i);

  // Step 5: Core PR bumps all 5 manifests + sync-host-core.mjs
  for (const manifest of [
    "plugin.json",
    ".github/plugin/marketplace.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "gemini-extension.json",
  ]) {
    assert.ok(output.includes(manifest), `Step 5 Core PR must list ${manifest}`);
  }
  assert.match(output, /sync-host-core\.mjs/);

  // Project profile stays <= 5.5 KB and host-accurate
  assert.ok(Buffer.byteLength(profile, "utf8") <= 5500, "project-profile.md must stay <= 5.5 KB");
  assert.match(profile, /plugin or extension/i);
  assert.match(profile, /precedence over skill instructions, including Superpowers/);
});

test("flow-docs and infra-review wire scan-flow-drift.mjs with manual fallback and shadow-mode telemetry", () => {
  const flowSkill = read("skills/flow-docs/SKILL.md");
  const beforeSection = flowSkill.split("## Before you change a flow")[1]?.split("## Update a flow doc")[0] ?? "";
  const updateSection = flowSkill.split("## Update a flow doc")[1]?.split("## Write a new flow doc")[0] ?? "";

  assert.ok(beforeSection.includes("scripts/scan-flow-drift.mjs"));
  assert.match(beforeSection, /node <flow-docs-skill-dir>\/scripts\/scan-flow-drift\.mjs --json/);
  assert.match(beforeSection, /git log -1 --format=%h -- <doc>/);
  assert.match(updateSection, /node <flow-docs-skill-dir>\/scripts\/scan-flow-drift\.mjs --changed-from <base-branch> --json/);
  assert.ok(updateSection.includes("unupdatedImpactedDocs"));
  assert.match(updateSection, /Step 5 self-review/);

  const infra = read("skills/infra-review/SKILL.md");
  const shadow = infra.split("### Shadow-mode objective telemetry")[1]?.split("## 3. Find the faults")[0] ?? "";
  assert.match(
    shadow,
    /node <dev-loop-checkout>\/skills\/flow-docs\/scripts\/scan-flow-drift\.mjs --repo-root <project-checkout> --json/,
  );
  assert.match(shadow, /--changed-from <mergeCommit>\^1 --changed-to <mergeCommit> --json/);
  assert.match(shadow, /unupdatedImpactedDocs/);
  assert.match(shadow, /explicitly approved worktree isolation/);
  assert.match(shadow, /`n\/a`/);
});

test("owner gate waivers record waived status and Owner waivers slots without touching core.mdc", () => {
  const core = read("com.github.copilot/rules/core.mdc");
  assert.equal(core.trimEnd().split(/\r?\n/).length, 44, "core.mdc must remain at 44 lines");
  assert.doesNotMatch(core, /\bwaived\b/i, "core.mdc must stay untouched by PR 4");

  const verifyReport = guidance.split("## Verify and report")[1]?.split("## Conclusion")[0] ?? "";
  for (const status of ["passed", "failed", "blocked", "not run", "not applicable", "waived"]) {
    assert.match(verifyReport, new RegExp(`\\| ${status} \\|`), `missing status row: ${status}`);
  }

  for (const [label, doc] of [
    ["testing.md", guidance],
    ["SKILL.md", skill],
    ["test-matrix.md", matrix],
    ["acceptance-record.md", acceptance],
    ["pr-body.md", pr],
  ]) {
    assert.match(doc, /\bwaived\b/i, `${label} must document waived status`);
  }

  for (const [label, section] of [
    ["SKILL.md ## 8. Report", skill.split("## 8. Report")[1]?.split("## Stop conditions")[0] ?? ""],
    ["test-matrix.md ## Coverage and remaining work", matrix.split("## Coverage and remaining work")[1] ?? ""],
    ["acceptance-record.md ### Compact test matrix", acceptance.split("### Compact test matrix")[1] ?? ""],
    ["pr-body.md ## Test coverage", pr.split("## Test coverage")[1]?.split("## Device handoff")[0] ?? ""],
  ]) {
    assert.match(section, /Owner waivers:/, `${label} must include Owner waivers slot`);
  }

  const skillDone = skill.split("- **Done:**")[1]?.split("\n")[0] ?? "";
  const acceptanceDone = acceptance.split("  - Done:")[1]?.split("\n")[0] ?? "";
  for (const [label, doneLine] of [
    ["SKILL.md - **Done:**", skillDone],
    ["acceptance-record.md - Done:", acceptanceDone],
  ]) {
    assert.match(doneLine, /each unwaived "done when" item has evidence at the head commit/i, `${label} must scope done-when head-commit evidence to unwaived items`);
    assert.match(doneLine, /except any required test case explicitly marked waived by a direct typed owner chat message/i, `${label} must restrict single-line waived exception to required test cases`);
    assert.match(doneLine, /raw status.*unverified risk/i, `${label} must require raw status and unverified risk`);
    assert.match(doneLine, /no unwaived required coverage gaps? remain/i, `${label} must forbid unwaived required coverage gaps`);
  }

  const ship = skill.split("## 7. Ship")[1]?.split("## After an authorized merge")[0] ?? "";
  assert.match(ship, /waived.*note|note.*waived/i, "SKILL.md ## 7. Ship must record waived cases as note, not validated or device_tested");
  const prAcceptance = pr.split("## Acceptance record")[1]?.split("## Evidence")[0] ?? "";
  assert.match(prAcceptance, /head-commit evidence/i, "pr-body.md ## Acceptance record must require head-commit evidence");
  assert.match(prAcceptance, /applicable required cases all passed/i, "pr-body.md ## Acceptance record must scope pass requirement to applicable required cases");
  assert.match(prAcceptance, /depends on a waived.*unchecked/i, "pr-body.md ## Acceptance record must keep any item depending on a waived case unchecked");
  assert.doesNotMatch(prAcceptance, /backed only by a waived/i, "pr-body.md ## Acceptance record must not allow checking mixed-coverage waived items");
  assert.match(pr.split("## Evidence")[1]?.split("## Test coverage")[0] ?? "", /waived/i, "pr-body.md ## Evidence must support waived (<raw status>) without false pass");
});

test("waived requires a direct typed owner chat message, preserves raw status, and forbids passed claims or safety-boundary waivers", () => {
  const verifyReport = guidance.split("## Verify and report")[1]?.split("## Conclusion")[0] ?? "";
  assert.match(verifyReport, /required test case or verification check/i);
  assert.doesNotMatch(verifyReport, /required check or gate/i);
  assert.match(verifyReport, /direct typed.*chat message|explicitly waived.*direct typed chat message/i);
  assert.match(verifyReport, /not run, blocked, or failed/i);
  assert.match(verifyReport, /it is not a pass/i);
  assert.match(verifyReport, /ask_user/i);
  assert.match(verifyReport, /away mode/i);
  assert.match(verifyReport, /coordinator.*peer-session|subagent, coordinator, or peer-session/i);
  assert.match(verifyReport, /kickoff/i);
  assert.match(verifyReport, /cross_session_message/i);
  assert.match(verifyReport, /quoted.*hypothetical|hypothetical/i);
  assert.match(verifyReport, /earlier PR|old PR|prior PR/i);
  assert.match(verifyReport, /design.*plan approval|feature-design.*risky-plan/i);
  assert.match(verifyReport, /independent agent review/i);
  assert.match(verifyReport, /Critical or Important/i);
  assert.match(verifyReport, /head-commit.*CI|PR CI|checks pass at the head commit/i);
  assert.match(verifyReport, /rebase.*amend.*force-push.*push to main/i);
  assert.match(verifyReport, /merge.*deploy/i);
  assert.match(verifyReport, /personal-data.*secret|personal data.*secret/i);
  assert.match(verifyReport, /never report.*waived.*as passed|waived.*not.*passed/i);

  const verify = skill.split("## 6. Verify")[1]?.split("## 7. Ship")[0] ?? "";
  assert.match(verify, /device test.*not explicitly waived/i, "SKILL.md ## 6. Verify must skip device execution when explicitly waived");
  assert.match(verify, /if an unwaived check stops/i, "SKILL.md ## 6. Verify must scope stopped-check remediation to unwaived checks");
  const skillBlocked = skill.split("- **Blocked:**")[1]?.split("\n- **Ask the owner**")[0] ?? "";
  const acceptanceBlocked = acceptance.split("  - Blocked:")[1]?.split("\n\n")[0] ?? "";
  assert.match(skillBlocked, /no device for an unwaived device check/i, "SKILL.md Blocked must scope no-device stop to unwaived device checks");
  assert.match(acceptanceBlocked, /no device for an unwaived device check/i, "acceptance-record.md Blocked must scope no-device stop to unwaived device checks");

  const report = skill.split("## 8. Report")[1]?.split("## Stop conditions")[0] ?? "";
  assert.match(report, /ready with owner waiver \(<case IDs>\)/);
  assert.match(report, /every other Done gate is satisfied.*ready with owner waiver/i, "SKILL.md ## 8. Report must require all non-waivable Done gates before ready with owner waiver");
  assert.match(report, /never claim.*all required checks passed/i);

  const ruleMap = read("README.md").split("## Rule/check map")[1]?.split(/\n#{2,3} /)[0] ?? "";
  assert.match(ruleMap, /\bwaived\b/i);
});

test("T-IR9: PR evidence rule miner, review checklist template, and Step-5 checklist path contract", () => {
  const infra = read("skills/infra-review/SKILL.md");
  const ruleMiner = read("skills/infra-review/references/rule-miner.md");
  const devLoop = read("skills/dev-loop/SKILL.md");
  const profile = read("skills/dev-loop/assets/project-profile.md");
  const checklistTemplate = read("skills/dev-loop/assets/review-checklist.md");

  const measure = infra.split("## 2. Measure")[1]?.split("## 3. Find the faults")[0] ?? "";
  const choose = infra.split("## 4. Choose the changes")[1]?.split("## 5. Output")[0] ?? "";
  const output = infra.split("## 5. Output")[1] ?? "";
  const selfReview = devLoop.split("## 5. Self-review")[1]?.split("## 6. Verify")[0] ?? "";

  // Bundled miner script + rule-miner reference wired into infra-review without changing the 17-row table
  assert.ok(measure.includes("scripts/mine-pr-evidence.mjs"), "Shadow-mode telemetry must wire scripts/mine-pr-evidence.mjs");
  assert.ok(choose.includes("references/rule-miner.md"), "Section 4 must reference references/rule-miner.md");
  assert.match(output, /review-checklist\.md/, "Section 5 Project PR must cover review-checklist.md updates");

  // Generator + fresh Validator contract, domains, caps, untrusted boundary, and 4-week non-safety retirement
  assert.match(ruleMiner, /Generator/);
  assert.match(ruleMiner, /Validator/);
  for (const domain of ["arch-correctness", "concurrency-state", "security-privacy", "ui-a11y"]) {
    assert.ok(ruleMiner.includes(domain), `rule-miner.md must allow domain ${domain}`);
  }
  assert.match(ruleMiner, /min\(3,\s*remainingSlots\)/);
  assert.match(ruleMiner, /25/);
  assert.match(ruleMiner, /"untrusted":\s*true|untrusted/i);
  assert.match(ruleMiner, /Retired or automated rules/);
  assert.match(ruleMiner, /Safety\?.*yes|never.*retire/i);
  assert.match(
    ruleMiner,
    /after updating.*counters.*re-run.*--checklist|recompute.*staleRules.*after.*counter/is,
    "rule-miner.md must recompute staleRules after weekly counter updates",
  );

  // Checklist template + project profile + Step-5-only loading (+0 startup bytes)
  assert.ok(checklistTemplate.includes("## Active rules"));
  assert.ok(checklistTemplate.includes("## Retired or automated rules"));
  assert.ok(Buffer.byteLength(profile, "utf8") <= 5500, "project-profile.md must stay <= 5.5 KB");
  assert.match(profile, /Checklist path.*docs\/testing\/review-checklist\.md/s);
  assert.match(profile, /inline only/);
  assert.match(selfReview, /Checklist path/);
  assert.match(selfReview, /inline only/);
  assert.match(selfReview, /not.*startup|never.*startup|only during.*review/i);
});


