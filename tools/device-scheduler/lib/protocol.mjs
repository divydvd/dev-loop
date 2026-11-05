const limit = 65536;
export const identifier = value => typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value);
export const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).sort().join() === [...fields].sort().join();
export function encode(frame) {
  const data = JSON.stringify(frame);
  if (Buffer.byteLength(data) > limit) throw new Error("FRAME_TOO_LARGE");
  return data + "\n";
}
export function decoder(onFrame, onError) {
  let buffer = Buffer.alloc(0), failed = false;
  return chunk => {
    if (failed) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      const end = buffer.indexOf(10);
      if ((end < 0 ? buffer.length : end) > limit) {
        failed = true; onError("FRAME_TOO_LARGE"); return;
      }
      if (end < 0) return;
      let frame;
      try {
        frame = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, end)));
        if (!frame || Object.getPrototypeOf(frame) !== Object.prototype) throw new Error();
      } catch {
        failed = true; onError("INVALID_FRAME"); return;
      }
      buffer = buffer.subarray(end + 1);
      onFrame(frame);
      if (failed) return;
    }
  };
}
