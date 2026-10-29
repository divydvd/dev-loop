import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const core = readFileSync(new URL("../com.github.copilot/rules/core.mdc", import.meta.url), "utf8");
const rule = core.split(/\r?\n/).find((line) => line.startsWith("21. ")) ?? "";

test("the rule permits base-into-working-branch maintenance without a blanket local merge ban", () => {
  assert.match(rule, /merge.*PR.s base.*working branch/i);
  assert.doesNotMatch(rule, /never merge locally/i);
});

test("the rule still forbids local integration and rewritten history", () => {
  assert.match(rule, /never merge into.*default branch locally/i);
  assert.match(rule, /rebase.*force push/i);
  assert.match(rule, /merge a PR only when the owner tells you/i);
});

test("a maintained branch must be verified and reviewed again", () => {
  assert.match(rule, /rerun.*checks.*review/i);
});
