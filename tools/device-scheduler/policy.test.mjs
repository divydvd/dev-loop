import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { executionSetup } from "./execution-test-support.mjs";

test("private execution policy rejects missing identity, unsafe paths, and helper pins", async t => {
  const { readExecutionPolicy } = await import("./lib/policy.mjs");
  const f = executionSetup(t);
  assert.equal(readExecutionPolicy(f.policyPath).execution[1].identity, "synthetic-ios-identity");
  for (const change of [
    p => { p.execution[0].identity = ""; },
    p => { p.execution[0].identity = "another-device"; },
    p => { p.execution[1].helper.sha256 = "wrong"; },
    p => { p.execution[0].procedures.act.arguments = ["arbitrary"]; },
    p => { p.execution[1].alias = "android"; },
    p => { p.execution[0].procedures.act.program.path = "/tmp/../bin/node"; },
  ]) {
    const original = JSON.stringify(f.policy);
    change(f.policy); f.save();
    assert.throws(() => readExecutionPolicy(f.policyPath), /INVALID_EXECUTION_POLICY/);
    Object.assign(f.policy, JSON.parse(original));
  }
  f.save(); fs.chmodSync(f.policyPath, 0o644);
  assert.throws(() => readExecutionPolicy(f.policyPath), /UNSAFE_POLICY/);
});

test("pin checking preserves unrelated filesystem failures", async t => {
  const { checkPin } = await import("./lib/policy.mjs");
  const f = executionSetup(t), stat = fs.lstatSync;
  t.after(() => { fs.lstatSync = stat; });
  for (const code of ["EACCES", "EIO"]) {
    const error = Object.assign(new Error("injected filesystem failure"), { code });
    fs.lstatSync = file => { if (file === f.helper) throw error; return stat(file); };
    assert.throws(() => checkPin(f.policy.execution[0].helper), thrown => thrown === error);
  }
});
