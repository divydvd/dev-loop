import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("real-host failure cleanup stops descendants before the first snapshot", () => {
  const script = fileURLToPath(new URL("./fixtures/real-host-cleanup.test.py", import.meta.url));
  const result = spawnSync("python3", [script], { encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
