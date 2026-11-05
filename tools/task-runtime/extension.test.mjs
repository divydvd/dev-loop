import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const boundary of ["cancelled", "paused", "safety_stop"]) test(`adapter preserves ${boundary}, host identity, and native permissions`, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-adapter-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "progress.md"), "existing project ledger");
  const base = new URL("./", import.meta.url);
  const result = spawnSync(process.execPath, [
    "--loader", fileURLToPath(new URL("fixtures/sdk-loader.mjs", base)),
    fileURLToPath(new URL("fixtures/extension-driver.mjs", base)),
    new URL("extension.mjs", base).href,
  ], {
    cwd: root, encoding: "utf8", env: {
      ...process.env, TASK_RUNTIME_DIRECTORY: path.join(root, "private"), TASK_TEST_BOUNDARY: boundary,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /attached adapter contract passed/);
});
