import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const core = read("com.github.copilot/rules/core.mdc");
const skill = read("skills/dev-loop/SKILL.md");
const profile = read("skills/dev-loop/assets/project-profile.md");
const pr = read("skills/dev-loop/assets/pr-body.md");

test("the always-loaded rule protects the passing build from stale monitor grants", () => {
  assert.match(core, /passing.*build.*installed/i);
  assert.match(core, /monitor.*grants.*device.*procedure/i);
});

test("test cleanup separates the passing build from restored data and settings", () => {
  assert.match(skill, /passing device test, keep the tested build installed/i);
  assert.match(skill, /restore.*test data and.*settings/i);
  assert.match(skill, /do not reinstall.*pretest.*APK/i);
  assert.match(skill, /project recovery procedure after FAIL or BLOCKED/i);
});

test("the post-merge refresh requires authorization and a confirmed merged PR", () => {
  assert.match(skill, /## After an authorized merge/);
  const refresh = skill.split("## After an authorized merge")[1];
  assert.match(refresh, /confirm.*PR.*merged/i);
  assert.match(refresh, /does not authorize.*merge/i);
  assert.match(refresh, /latest fetched default.branch/i);
  assert.match(refresh, /source.*SHA.*artifact.*installed/i);
});

test("the refresh preserves shared-device and owner safety gates", () => {
  const refresh = skill.split("## After an authorized merge")[1] ?? "";
  assert.match(refresh, /exclusive.*device.*access/i);
  assert.match(refresh, /heavy.build.*lane/i);
  assert.match(refresh, /do not.*downgrade.*uninstall/i);
  assert.match(refresh, /blocked.*preserve.*installed/i);
  assert.match(refresh, /sign.in.*owner/i);
  assert.match(refresh, /do not.*switch.*checkout/i);
});

test("the refresh is limited to projects and changes that need a device build", () => {
  const refresh = skill.split("## After an authorized merge")[1] ?? "";
  assert.match(refresh, /no device test.*not needed/i);
  assert.match(refresh, /no.*release.*deploy/i);
  assert.match(refresh, /default branch.*advanced.*report/i);
});

test("the profile gives monitors and merging sessions an explicit handoff contract", () => {
  assert.match(profile, /\*\*Final build:\*\*/);
  assert.match(profile, /\*\*Device access:\*\*/);
  assert.match(profile, /\*\*Post-merge refresh:\*\*/);
  assert.match(profile, /source.*artifact.*installed/i);
});

test("the report distinguishes installed app identity from the selected keyboard", () => {
  assert.match(skill, /selected keyboard.*separately/i);
  assert.match(pr, /## Device handoff/);
  assert.match(pr, /Installed test build/);
  assert.match(pr, /Selected keyboard/);
  assert.match(pr, /Post-merge refresh/);
  assert.match(pr, /not merged.*blocked.*not needed/i);
});
