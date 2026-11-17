// Test-only transport. The extension and policy remain real; no SDK host connects.
export async function resolve(specifier, context, nextResolve) {
  if (specifier !== "@github/copilot-sdk/extension") return nextResolve(specifier, context);
  const source = `
    export async function joinSession(options) {
      const callbacks = new Map();
      const logs = [];
      const logEntries = [];
      const sentPrompts = [];
      let notify;
      let notifyPrompt;
      const host = {
        options,
        callbacks,
        logs,
        logEntries,
        sentPrompts,
        failNextSend: false,
        hangNextSend: false,
        historyEvents: process.env.TEST_HISTORY_EVENTS_JSON
          ? JSON.parse(process.env.TEST_HISTORY_EVENTS_JSON)
          : [{ id: "initial", type: "user.message", data: { content: "guard rebase off" } }],
        session: null,
        nextLog: () => new Promise((resolve) => { notify = resolve; }),
        nextPrompt: () => new Promise((resolve) => {
          const hold = setInterval(() => {}, 5000);
          notifyPrompt = (payload) => {
            clearInterval(hold);
            setImmediate(() => resolve(payload));
          };
        }),
      };
      const session = {
        sessionId: process.env.TEST_SESSION_ID || "owner-runtime",
        log: (text, meta) => {
          logs.push(text);
          logEntries.push({ text, meta });
          if (notify) { const fn = notify; notify = null; fn(text); }
        },
        send: async (payload) => {
          if (host.hangNextSend) {
            return new Promise(() => {});
          }
          if (host.failNextSend) {
            host.failNextSend = false;
            throw new Error("simulated session.send transport disconnect");
          }
          sentPrompts.push(payload);
          if (notifyPrompt) { const fn = notifyPrompt; notifyPrompt = null; fn(payload); }
        },
        on: (name, callback) => callbacks.set(name, callback),
        getEvents: async () => host.historyEvents,
      };
      host.session = session;
      globalThis.ledgerTestHost = host;
      return session;
    }`;
  return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
}
