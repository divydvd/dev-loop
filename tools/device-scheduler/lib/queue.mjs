const fail = code => { throw new Error(code); };
const id = value => typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value);
const text = value => typeof value === "string" && value.trim().length > 0 && value.length <= 500;
const integer = value => Number.isSafeInteger(value) && value > 0;
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => object(value) && Object.keys(value).sort().join() === [...fields].sort().join();
const canonical = value => JSON.stringify(object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) : value);
const boundFields = ["requestId", "device", "policyVersion", "generation"];
const fields = {
  policy: ["device", "policyVersion", "resources", "enabled"],
  request: ["requestId", "device", "policyVersion", "repository", "scope", "resumeAction"],
  reserve: ["requestId"], recover: boundFields, fault: [...boundFields, "reason"],
  acknowledge: boundFields, operation_start: [...boundFields, "operationId", "purpose"],
  operation_finish: [...boundFields, "operationId", "outcome"],
  release: [...boundFields, "clean", "result"],
};

function validate(auth, event) {
  if (!exact(auth, ["id", "role"]) || !id(auth.id) || !["session", "scheduler"].includes(auth.role) ||
      !exact(event, ["version", "id", "kind", "payload"]) || event.version !== 1 || !id(event.id)) fail("INVALID_EVENT");
  const p = event.payload, kind = event.kind;
  const expected = ["wait_owner", "resume", "cancel"].includes(kind)
    ? (object(p) && Object.hasOwn(p, "generation") ? boundFields : ["requestId"])
    : Object.hasOwn(fields, kind) ? fields[kind] : null;
  if (!expected || !exact(p, expected)) fail("INVALID_EVENT");
  for (const key of ["requestId", "device", "operationId"]) if (key in p && !id(p[key])) fail("INVALID_EVENT");
  for (const key of ["policyVersion", "generation"]) if (key in p && !integer(p[key])) fail("INVALID_EVENT");
  if (kind === "request" && !["repository", "scope", "resumeAction"].every(key => text(p[key]))) fail("INVALID_EVENT");
  if (kind === "policy" && (typeof p.enabled !== "boolean" || !Array.isArray(p.resources) ||
      p.resources.length > 32 || !Array.from(p.resources).every(id) || new Set(p.resources).size !== p.resources.length)) fail("INVALID_EVENT");
  if (kind === "operation_start" && !["test", "recovery"].includes(p.purpose)) fail("INVALID_EVENT");
  if (kind === "operation_finish" && !["complete", "unknown"].includes(p.outcome)) fail("INVALID_EVENT");
  if (kind === "release" && (typeof p.clean !== "boolean" || !["pass", "fail", "blocked"].includes(p.result))) fail("INVALID_EVENT");
  if (kind === "fault" && !["timeout", "crash", "disconnected", "failure"].includes(p.reason)) fail("INVALID_EVENT");
  if (["policy", "fault", "recover"].includes(kind) && auth.role !== "scheduler") fail("FORBIDDEN");
}

const conflicts = (a, b) => a.device === b.device || a.resources.some(resource => b.resources.includes(resource));
function eligible(state) {
  const held = state.requests.filter(r => state.devices.some(d => d.holder === r.id));
  return state.requests.filter(r => {
    const policy = state.policies.findLast(p => p.device === r.device);
    const device = state.devices.find(d => d.id === r.device);
    return r.state === "queued" && policy?.enabled && policy.policyVersion === r.policyVersion &&
      device?.safety === "safe" && device.holder === null && !held.some(h => conflicts(r, h));
  }).sort((a, b) => a.order - b.order);
}

/** Advisory snapshot only. Reservation checks again inside BEGIN IMMEDIATE. */
export function eligibleRequests(store) { return eligible(store.read()); }

function quarantine(state, request, status = "recovering") {
  if (request.state === "waiting_owner" && status !== "cancelled") request.beforeWait = status;
  else request.state = status;
  request.grant.revoked = true;
  state.devices.find(d => d.id === request.device).safety = "quarantined";
}

function issue(device, request, recovery) {
  device.generation++;
  device.holder = request.id;
  if (request.state === "waiting_owner") request.beforeWait = "recovering";
  else request.state = recovery ? "recovering" : "reserved";
  request.grant = {
    requestId: request.id, sessionId: request.sessionId, device: request.device,
    policyVersion: request.policyVersion, generation: device.generation,
    acknowledged: false, revoked: false, recovery,
  };
}

function checkGrant(request, device, p, allowRevoked = false) {
  const grant = request.grant;
  if (!grant || grant.revoked && !allowRevoked || device.holder !== request.id || device.generation !== grant.generation ||
      boundFields.some(key => p[key] !== grant[key])) fail("INVALID_GRANT");
  return grant;
}

function transition(state, auth, { kind, payload: p }) {
  if (kind === "policy") {
    const previous = state.policies.findLast(policy => policy.device === p.device);
    if (previous && p.policyVersion <= previous.policyVersion) fail("POLICY_VERSION");
    state.policies.push(structuredClone(p));
    if (!state.devices.some(d => d.id === p.device)) state.devices.push({ id: p.device, safety: "safe", generation: 0, holder: null });
    for (const r of state.requests.filter(r => r.device === p.device && !["released", "cancelled"].includes(r.state))) {
      if (state.devices.some(d => d.holder === r.id)) quarantine(state, r);
      else r.state = "blocked";
    }
    return null;
  }
  let r = state.requests.find(request => request.id === p.requestId);
  if (kind === "request") {
    const details = { ...p, sessionId: auth.id };
    if (r) {
      if (r.signature !== canonical(details)) fail("REQUEST_CONFLICT");
      return r;
    }
    const policy = state.policies.findLast(policy => policy.device === p.device);
    if (!policy?.enabled || policy.policyVersion !== p.policyVersion) fail("INVALID_POLICY");
    r = {
      id: p.requestId, ...details, signature: canonical(details), order: ++state.next,
      resources: [...policy.resources], state: "queued", grant: null, operations: [],
    };
    state.requests.push(r);
    return r;
  }
  if (!r) fail("INVALID_REQUEST");
  if (!["fault", "recover"].includes(kind) && r.sessionId !== auth.id) fail("SESSION_MISMATCH");
  const d = state.devices.find(device => device.id === r.device);
  const held = d.holder === r.id;
  if (kind === "reserve") {
    const candidates = eligible(state), position = candidates.findIndex(candidate => candidate.id === r.id);
    if (position < 0 || candidates.slice(0, position).some(candidate => conflicts(candidate, r))) fail("NOT_ELIGIBLE");
    issue(d, r, false);
    return r;
  }
  if (kind === "fault") {
    if (!held) fail("INVALID_TRANSITION");
    checkGrant(r, d, p, true);
    quarantine(state, r);
    return r;
  }
  if (kind === "recover") {
    if (!held || d.safety !== "quarantined" || !r.grant.revoked) fail("INVALID_TRANSITION");
    checkGrant(r, d, p, true);
    issue(d, r, true);
    return r;
  }
  const grant = held ? checkGrant(r, d, p) : null;
  if (kind === "cancel" && !held) {
    if (!["queued", "waiting_owner", "blocked"].includes(r.state)) fail("INVALID_TRANSITION");
    r.state = "cancelled";
  } else if (kind === "cancel") {
    if (!r.operations.length && d.safety === "safe" && !grant.recovery) {
      grant.revoked = true; d.generation++; d.holder = null; r.state = "cancelled";
    } else quarantine(state, r, "cancelled");
  } else if (kind === "wait_owner") {
    if (!["queued", "reserved", "running", "recovering"].includes(r.state)) fail("INVALID_TRANSITION");
    r.beforeWait = r.state; r.state = "waiting_owner";
  } else if (kind === "resume") {
    if (r.state !== "waiting_owner") fail("INVALID_TRANSITION");
    r.state = r.beforeWait; delete r.beforeWait;
  } else {
    if (!grant) fail("INVALID_GRANT");
    if (kind === "acknowledge") {
      grant.acknowledged = true;
    } else {
      if (!grant.acknowledged) fail("GRANT_NOT_ACKNOWLEDGED");
      if (kind === "operation_start") {
        if (r.state === "waiting_owner") fail("INVALID_TRANSITION");
        if (grant.recovery && p.purpose !== "recovery") fail("RECOVERY_ONLY");
        if (r.operations.some(operation => operation.id === p.operationId)) fail("DUPLICATE_OPERATION");
        if (!grant.recovery && r.operations.some(operation => operation.outcome !== "complete")) fail("UNRESOLVED_OPERATION");
        r.operations.push({ id: p.operationId, outcome: "inflight", purpose: p.purpose });
        if (!grant.recovery) r.state = "running";
        d.safety = grant.recovery ? "quarantined" : "uncertain";
      } else if (kind === "operation_finish") {
        const operation = r.operations.find(operation => operation.id === p.operationId);
        if (!operation || operation.outcome === "complete") fail("INVALID_OPERATION");
        operation.outcome = p.outcome;
      } else if (kind === "release") {
        if (!p.clean) quarantine(state, r);
        else {
          if (r.operations.some(operation => operation.outcome !== "complete")) fail("UNRESOLVED_OPERATION");
          r.state = "released"; r.result = p.result; grant.revoked = true;
          d.generation++; d.safety = "safe"; d.holder = null;
        }
      } else fail("INVALID_TRANSITION");
    }
  }
  return r;
}

/** Accept only broker-authenticated context. Event payloads never select the session. */
export function applyEvent(store, authenticatedSession, event) {
  validate(authenticatedSession, event);
  return store.transaction(state => {
    const signature = canonical({ authenticatedSession, event });
    const previous = state.events.find(record => record.id === event.id);
    if (previous) {
      if (previous.signature !== signature) fail("EVENT_CONFLICT");
      return { ...structuredClone(previous.result), replayed: true };
    }
    const request = transition(state, authenticatedSession, event);
    const outgoing = {
      id: `${event.id}:state`, sessionId: request?.sessionId ?? authenticatedSession.id,
      kind: event.kind, request: structuredClone(request),
    };
    state.outbox.push(outgoing);
    const result = { request: structuredClone(request), outgoingEventIds: [outgoing.id], replayed: false };
    state.events.push({ id: event.id, signature, result });
    return result;
  });
}
