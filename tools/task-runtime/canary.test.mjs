import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("canary correlates the logical message ID, not the timeline event ID", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-canary-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [
    "--loader", fileURLToPath(new URL("fixtures/sdk-loader.mjs", import.meta.url)),
    fileURLToPath(new URL("fixtures/canary-driver.mjs", import.meta.url)),
    new URL("fixtures/app-canary.mjs", import.meta.url).href,
  ], { encoding: "utf8", env: { ...process.env, TASK_CANARY_OUTPUT: path.join(root, "events.jsonl") } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /logical message identity preserved/);
});
