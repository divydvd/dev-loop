export async function joinSession(options) {
  const callbacks = new Map(), logs = [];
  const session = {
    sessionId: "attached-session",
    on(name, handler) { callbacks.set(name, handler); },
    log(message) { logs.push(message); },
  };
  globalThis.taskTestHost = { options, session, callbacks, logs };
  return session;
}
