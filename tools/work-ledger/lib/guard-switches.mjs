import crypto from "node:crypto";
import { cleanOwnerTextInfo } from "./grants.mjs";
import { configuredMavenScopes, localScopeId, localScopeProblem } from "./local-maven.mjs";

export const GUARD_NAMES = ["rebase", "amend", "force-push", "push-main", "review-limit", "test-cache", "maven"];
/** The legacy "guards off" marker pauses only these optional limits. */
export const GLOBAL_PAUSE_GUARDS = ["review-limit", "test-cache"];
export const ALWAYS_ACTIVE = "merge approval, deployment/configuration approval, unverified Maven, guard-source protection, shared Gradle build lock";
export const GLOBAL_PAUSE_TEXT = `Global guard pause is ON (the owner typed "guards off"): review-limit and test-cache are paused for all repositories. Still enforced: ${ALWAYS_ACTIVE}. The rebase, amend, force-push, and push-main checks stay active unless a separately confirmed scoped pause applies. Type "guards on" to end the pause.`;
const MINUTE = 60000;
const repoId = (s) => typeof s === "string" && /^[\w.-]+\/[\w.-]+$/.test(s) ? s.toLowerCase() : null;
const matches = (p, repo, sessionId) => p.repo === repoId(repo) && (p.scope === "repository" || (p.scope === "session" && p.sessionId === sessionId));
const active = (p, now) => Date.parse(p.expiresAt) > now;

/** Controls accept only a complete, direct owner message, never extracted quoted text. */
export function directGuardText(e, firstUserId) {
  const d = e?.data || {};
  if (!e?.id || e.id === firstUserId || e.agentId || d.source || d.isAutopilotContinuation) return null;
  const raw = String(d.content || "").trim();
  if (!/^guards?\b/.test(raw) || cleanOwnerTextInfo(raw).text !== raw) return null;
  return raw;
}

export function parseGuardCommand(text) {
  const s = String(text || "").trim();
  if (/^guards? status$/.test(s)) return { kind: "status" };
  if (/^guard confirm [^\n]+$/.test(s)) return { kind: "confirm", text: s };
  const m = s.match(/^guard ([\w-]+) (off|on)(?: in (repository|session))?(?: for (\d+)(m|h))?$/);
  if (!m) return { error: "Invalid guard command. Use guard <check> off [in repository|session] [for 30m], or guard <check> on [in repository|session]." };
  if (!GUARD_NAMES.includes(m[1])) return { error: `Check ${m[1]} is not configurable in this layer. Supported: ${GUARD_NAMES.join(", ")}.` };
  const minutes = m[4] ? Number(m[4]) * (m[5] === "h" ? 60 : 1) : 30;
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440 || (m[2] === "on" && m[4])) return { error: "Invalid duration. Pauses require 1m through 24h; restore commands have no duration." };
  return { kind: "request", guard: m[1], state: m[2], scope: m[3] || "repository", minutes };
}

const confirmationOf = (p) => `guard confirm ${p.id} ${p.guard} ${p.state} in ${p.scope} ${p.repo} until ${p.expiresAt || "enabled"}${p.mavenScopeIds ? ` descriptors ${p.mavenScopeIds.join(",")}` : ""}`;

export function applyGuardCommand(data, command, context) {
  const { owner, sessionId, messageId, now = Date.now() } = context;
  const repo = repoId(context.repo);
  const reply = (text) => ({ text });
  if (owner !== true || !sessionId || !messageId) return reply("A direct owner message in a known session is required.");
  if (command.error) return reply(command.error);
  if (command.kind === "status") return reply(guardStatus(data, context));
  if (!repo) return reply("Cannot resolve this repository. No guard control changed.");
  if (command.kind === "confirm") {
    const p = (data.guardRequests || []).find((r) => confirmationOf(r) === command.text);
    if (!p || p.repo !== repo || p.sessionId !== sessionId || now < Date.parse(p.at) ||
        now >= Date.parse(p.confirmBy) || (p.expiresAt && !active(p, now))) return reply("Invalid, stale, or mismatched confirmation. Request a new preview.");
    if (p.messageId === messageId) return reply("Confirmation requires a separate direct owner message.");
    if (p.guard === "maven" && p.state === "off") {
      const scopes = configuredMavenScopes(context.config, repo);
      if (!scopes.length || scopes.some(localScopeProblem) || JSON.stringify(scopes.map(localScopeId).sort()) !== JSON.stringify(p.mavenScopeIds)) return reply("Maven descriptors changed or are invalid. Request a new preview.");
    }
    data.guardRequests = data.guardRequests.filter((r) => r.id !== p.id);
    data.guardPauses = (data.guardPauses || []).filter((r) => !(r.guard === p.guard && r.repo === repo && r.scope === p.scope && (r.scope !== "session" || r.sessionId === sessionId)));
    if (p.state === "off") data.guardPauses.push({ ...p, confirmedAt: new Date(now).toISOString(), confirmedMessageId: messageId });
    audit(data, { ...p, type: "guard.confirmed", requestMessageId: p.messageId, messageId, at: new Date(now).toISOString() });
    return reply(`Guard ${p.guard} ${p.state} confirmed for ${p.scope} ${repo}${p.scope === "session" ? ` (${sessionId})` : ""}${p.expiresAt ? ` until ${p.expiresAt}` : ""}. This is not action approval.`);
  }
  if (command.kind !== "request") return reply("Invalid guard command.");
  const scopes = command.guard === "maven" && command.state === "off" ? configuredMavenScopes(context.config, repo) : [];
  if (command.guard === "maven" && command.state === "off" && (!scopes.length || scopes.some(localScopeProblem))) return reply(`Invalid Maven scope configuration: ${scopes.map(localScopeProblem).find(Boolean) || "no owner-maintained descriptor for this repository"}. No preview created.`);
  const p = {
    id: crypto.randomBytes(8).toString("hex"), guard: command.guard, state: command.state,
    scope: command.scope, repo, sessionId, messageId, at: new Date(now).toISOString(),
    expiresAt: command.state === "off" ? new Date(now + command.minutes * MINUTE).toISOString() : null,
    confirmBy: new Date(now + Math.min(5, command.state === "off" ? command.minutes : 5) * MINUTE).toISOString(),
    ...(scopes.length ? { mavenScopeIds: scopes.map(localScopeId).sort() } : {}),
  };
  data.guardRequests = (data.guardRequests || []).filter((r) => r.sessionId !== sessionId && Date.parse(r.confirmBy) > now);
  data.guardRequests.push(p);
  audit(data, { ...p, type: "guard.requested" });
  return {
    text: `Preview: ${p.guard} ${p.state} in ${p.scope} ${repo}${p.scope === "session" ? ` (${sessionId})` : ""} until ${p.expiresAt || "enabled"}. Enforcement is unchanged.${scopes.map(s => `\nReviewed Maven descriptor: ${s.label}; cwd ${s.cwd}; SHA ${s.sha}; launcher ${s.launcher}; destination ${s.destination}; exact command: ${s.command}`).join("")} Before ${p.confirmBy}, type:\n${confirmationOf(p)}`,
    confirmation: confirmationOf(p),
  };
}

function audit(data, entry) {
  data.guardAudit = [...(data.guardAudit || []), entry].slice(-200);
}

export function effectiveGuardState(data, guard, repo, sessionId, now = Date.now()) {
  const pauses = GUARD_NAMES.includes(guard) ? (data.guardPauses || []).filter((p) => p.guard === guard && matches(p, repo, sessionId) && active(p, now)) : [];
  return { enabled: pauses.length === 0, pauses };
}

export function guardStatus(data, { repo, sessionId, now = Date.now(), globalPause = false } = {}) {
  const lines = GUARD_NAMES.map((g) => {
    const s = effectiveGuardState(data, g, repo, sessionId, now);
    const global = globalPause && GLOBAL_PAUSE_GUARDS.includes(g);
    return `${g}: ${s.enabled && !global ? "enabled" : "paused"}${global ? " [global pause]" : ""}${s.pauses.map((p) => ` [${p.scope} ${p.repo}${p.scope === "session" ? ` session ${p.sessionId}` : ""} until ${p.expiresAt}]`).join("")}`;
  });
  if (globalPause) lines.unshift(GLOBAL_PAUSE_TEXT);
  for (const p of data.guardPauses || []) {
    if (p.repo !== repoId(repo) || (p.scope === "session" && p.sessionId !== sessionId)) continue;
    if (!active(p, now)) lines.push(`Expired: ${p.guard} ${p.scope} ${p.repo} at ${p.expiresAt}; enforcement restored.`);
  }
  for (const p of (data.guardRequests || []).filter((p) => p.repo === repoId(repo) && p.sessionId === sessionId && Date.parse(p.confirmBy) > now)) {
    lines.push(`Pending preview (not active): ${p.guard} ${p.state} ${p.scope} ${p.repo}, expiry ${p.expiresAt || "enabled"}. To confirm, the owner types this exact line as a separate direct message before ${p.confirmBy}:`, confirmationOf(p));
  }
  lines.push(`Always active (no pause exists): ${ALWAYS_ACTIVE}.`);
  lines.push("Maven pauses apply only to confirmed descriptor fingerprints; exact source, launcher, command, destination, and shared locking are checked before execution.");
  lines.push("Pauses do not approve actions. Repository and session pauses can overlap; restoring one leaves the other active.");
  lines.push("Control audit (latest 10 events for this repository):");
  for (const a of (data.guardAudit || []).filter((a) => a.repo === repoId(repo)).slice(-10)) {
    lines.push(`${a.at} ${a.type}: ${a.guard} ${a.state} ${a.scope} ${a.repo} session ${a.sessionId}, expiry ${a.expiresAt || "enabled"}, message ${a.messageId}`);
  }
  return lines.join("\n");
}
