import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("installer folder is standalone and gates correction on actual marker discovery", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-canary-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = fileURLToPath(new URL("fixtures/app-canary/", import.meta.url));
  assert.ok(fs.existsSync(path.join(source, "extension.mjs")), "installer folder needs extension.mjs");
  fs.cpSync(source, path.join(root, "canary"), { recursive: true });
  const result = spawnSync(process.execPath, [
    "--loader", fileURLToPath(new URL("fixtures/sdk-loader.mjs", import.meta.url)),
    fileURLToPath(new URL("fixtures/canary-lifecycle-driver.mjs", import.meta.url)),
    pathToFileURL(path.join(root, "canary", "extension.mjs")).href,
  ], { encoding: "utf8", env: { ...process.env, TASK_CANARY_OUTPUT: path.join(root, "events.jsonl") } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bounded lifecycle and native cancellation preserved/);
});
