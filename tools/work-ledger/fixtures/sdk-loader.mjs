// Test-only transport. The extension and policy remain real; no SDK host connects.
export async function resolve(specifier, context, nextResolve) {
  if (specifier !== "@github/copilot-sdk/extension") return nextResolve(specifier, context);
  const source = `
    export async function joinSession(options) {
      const callbacks = new Map();
      const logs = [];
      const session = {
        sessionId: process.env.TEST_SESSION_ID || "owner-runtime",
        log: (text) => logs.push(text),
        on: (name, callback) => callbacks.set(name, callback),
        getEvents: async () => [{ id: "initial", type: "user.message", data: { content: "guard rebase off" } }],
      };
      globalThis.ledgerTestHost = { options, callbacks, logs, session };
      return session;
    }`;
  return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
}
