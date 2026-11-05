import test from "node:test";
import assert from "node:assert/strict";
import { decoder, encode } from "./lib/protocol.mjs";

test("framing preserves split UTF-8 bytes and multiple frames", () => {
  const frames = [], errors = [], parse = decoder(frame => frames.push(frame), code => errors.push(code));
  const data = Buffer.from('{"text":"é"}\n{"version":1}\n');
  for (const byte of data) parse(Buffer.from([byte]));
  assert.deepEqual(frames, [{ text: "é" }, { version: 1 }]);
  assert.deepEqual(errors, []);
});
test("malformed and non-object frames fail closed", () => {
  for (const input of ["{\n", "null\n", "[]\n", '"token"\n', "\xff\n"]) {
    const frames = [], errors = [], parse = decoder(frame => frames.push(frame), code => errors.push(code));
    parse(Buffer.from(input, "latin1"));
    parse(Buffer.from('{"ignored":true}\n'));
    assert.deepEqual(frames, []);
    assert.deepEqual(errors, ["INVALID_FRAME"]);
  }
});
test("64 KiB bounds apply to incoming and outgoing bytes, not characters", () => {
  const frames = [], errors = [], parse = decoder(frame => frames.push(frame), code => errors.push(code));
  const exact = { text: "x".repeat(65525) };
  assert.equal(Buffer.byteLength(encode(exact)), 65537);
  parse(Buffer.from(encode(exact)));
  assert.equal(frames.length, 1);
  parse(Buffer.from("x".repeat(65537)));
  assert.deepEqual(errors, ["FRAME_TOO_LARGE"]);
  assert.throws(() => encode({ text: "é".repeat(32768) }), /FRAME_TOO_LARGE/);
});
