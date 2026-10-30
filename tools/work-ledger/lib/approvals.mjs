// Reads the owner's typed words and finds approvals.
// Rules: skip questions, negated clauses and first-person statements
// ("i will merge them"). "merge it" / "merge them" refer to the session's
// pending requests.

const NEG_RE = /\b(not|no|never|don'?t|dont|do not|doesn'?t|didn'?t|shouldn'?t|won'?t|can'?t|cannot|without|avoid|stop|hold|wait|until|unless|before|nor|neither)\b/i;
const AFTER_NEG_RE = /\b(not|later|tomorrow|yet)\b/i;
const QUESTION_START_RE = /^\s*(?:(?:so|and|but|also|ok|okay|then|now|great|hmm|hey|btw|wait)\s*,?\s+)*(?:should|shall\s+(?:i|we)|do(?!\s+not\b)|does|did|is|are|was|were|have|has|had|which|what|when|why|how|who|whom|whose|where|am\s+i|can\s+i|could\s+i|may\s+i|will\s+i|would\s+i|isn'?t|aren'?t|wasn'?t|doesn'?t|didn'?t)\b/i;
const SELF_RE = [
  /\b(i|we)(\s+(will|shall|can|could|should|would|might|may|must|need\s+to|have\s+to|want\s+to|am\s+going\s+to|are\s+going\s+to|plan\s+to|am|are)|'ll|'d|'m|'re)\s+(\w+\s+){0,3}$/i,
  /\blet\s+me\s+(\w+\s+){0,2}$/i,
  /\b(that|which|when|then)\s+i\s+(\w+\s+){0,3}$/i,
  /\bi\s+(just\s+|already\s+)?$/i,
];
const MERGE_VERB_RE = /\b(merge|merging)\b/i;
const DEPLOY_VERB_RE = /\b(deploy|release|publish|push|upload|ship|roll\s*out|rollout|promote|distribute)\b/i;
const REVIEW_RE = /\b(re-?review|review)\b/i;
const REVIEW_MORE_RE = /\b(again|another|one\s+more|more|extra|re-?review|allow)\b/i;
const ANYWAY_RE = /\b(anyway|anyways|regardless|even\s+if|override|ignore\s+(the\s+)?(ci|checks?|failures?))\b/i;
const NON_OBJECT_RE = /^\s*(conflicts?|rules?|requests?|queue|order|commits?|strategy|method|button|base|into|with|state|status|checks?|blocked|errors?|ready|process|flow|messages?|window|freeze|gate|guards?|approvals?|permissions?|policy|logic|steps?|scripts?|tool|bot)\b/i;
const NOUN_BEFORE_RE = /\b(the|a|an|this|that|its|my|our|your|their|any|each|every|last|first|next|previous)\s+$/i;
const DEPLOY_NON_OBJECT_RE = /^\s*(notes?|branch(es)?|notifications?|access|date|schedule|process|pipeline|workflows?|scripts?|checklist|plan|candidates?|status|logs?|errors?|failed|failures?|issues?|keys?|tokens?|permissions?|rights)\b/i;
const CONTEXT_DEPLOY_VERB_RE = /^(deploy|release|publish|ship|roll\s*out|rollout|promote|distribute)$/i;
const ALL_OBJ_RE = /^\s*(them|these|those|all|both|everything|the\s+ones|the\s+rest|the\s+prs|the\s+pull\s+requests|all\s+of\s+them|the\s+other\s+prs)\b/i;
const ONE_OBJ_RE = /^\s*(it|this|that|this\s+pr|that\s+pr|the\s+pr|this\s+one|the\s+pull\s+request)\b/i;
const FILLER_RE = /^[\s,.!:-]*(now|please|pls|then|today|asap|right\s+away|go\s+ahead)?[\s,.!:-]*$/i;

const TARGETS = [
  ["billing", /\b(billing(\s+catalog)?|in-?app\s+products?|iap|subscriptions?\s+catalog|product\s+catalog)\b/i],
  ["firebase", /\b(firebase|functions|firestore|backend)\b/i],
  ["crowdin", /\b(crowdin|translations?)\b/i],
  ["github-release", /\b(github[- ]release|gh\s+release|tags?)\b/i],
  ["config", /\b(config|variables?|secrets?|env\s+vars?)\b/i],
  ["gcloud", /\b(gcloud|cloud\s+run|app\s+engine)\b/i],
  ["environment", /\b(environment|pending\s+deployment)\b/i],
  ["play", /\b(play\s*store|playstore|google\s+play|play\s+console|play|internal\s+(testing|track|testers)|store|aab|app\s+bundle)\b|\b(build|release|apk)\b(?!\s*(notes?|fix(es)?|script|branch|logs?|errors?|failures?|issues?|config))/i],
];

/** Split text into clauses; remember which ones end with "?". */
export function clauses(text) {
  const out = [];
  const s = String(text || "");
  let cur = "";
  const flush = (q) => { const t = cur.trim(); if (t) out.push({ text: t, question: q }); cur = ""; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "\n") { flush(false); continue; }
    if (c === "?") { flush(true); continue; }
    if ((c === "." || c === "!") && (next === undefined || /\s/.test(next))) { flush(false); continue; }
    if (c === ";") { flush(false); continue; }
    if ((c === "-" || c === "—" || c === "–") && /\s/.test(s[i - 1] || "") && (next === undefined || /\s|-/.test(next))) {
      if (next === "-") i++;
      flush(false);
      continue;
    }
    if ((c === "—" || c === "–")) { flush(false); continue; }
    cur += c;
  }
  flush(false);
  return out.flatMap((c) => c.text.split(SPLIT_RE).map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, question: c.question })));
}
const SPLIT_RE = /\s*,?\s+(?:and\s+then|and|but|then|or)\s+(?=(?:please\s+|pls\s+|also\s+|just\s+)?(?:don'?t|do\s+not|not|never|no|merge|merging|deploy|release|publish|push|ship|upload|re-?review|review|turn|guards?)\b)/i;

/** PR references: #12, PR 12, PRs 12 and 13, owner/repo#12, pull URLs. */
export function prRefs(text, defaultRepo) {
  const refs = [];
  const add = (repo, pr) => {
    const n = Number(pr);
    if (!Number.isInteger(n) || n <= 0) return;
    const r = repo || defaultRepo || null;
    if (!refs.some((x) => x.pr === n && x.repo === r)) refs.push({ repo: r, pr: n });
  };
  const s = String(text || "");
  let m;
  const url = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g;
  while ((m = url.exec(s))) add(`${m[1]}/${m[2]}`, m[3]);
  const stripped = s.replace(url, " ");
  const full = /\b([\w.-]+\/[\w.-]+)#(\d+)\b/g;
  while ((m = full.exec(stripped))) add(m[1], m[2]);
  const rest = stripped.replace(full, " ");
  const hash = /(^|[^\w/&])#(\d{1,6})\b/g;
  while ((m = hash.exec(rest))) add(null, m[2]);
  const list = /\b(?:prs?|pull\s+requests?)\s*((?:#?\d{1,6}(?:\s*(?:,|and|&|\+)\s*)?)+)/gi;
  while ((m = list.exec(rest))) for (const d of m[1].match(/\d{1,6}/g) || []) add(null, d);
  return refs;
}

const ZONE_END_RE = /(?:[,;:]\s*|\s+)(?:and|but|so|because|once|since|after|when|while|then|as|if|though|although)\s+(?!(?:#|prs?\b|pull\b|\d))|[,;:]\s+(?!(?:and\s+)?(?:#|prs?\b|pull\b|\d|https?:))/i;
/** The words right after a verb, up to the next clause break. */
function objectZone(after) {
  const m = ZONE_END_RE.exec(after);
  return m ? after.slice(0, m.index) : after;
}

function bareNumbersAfterVerb(after, defaultRepo) {
  const m = after.match(/^\s*((?:#?\d{2,6}(?:\s*(?:,|and|&|\+)\s*)?)+)/i);
  if (!m) return [];
  return (m[1].match(/\d{2,6}/g) || []).map((d) => ({ repo: defaultRepo || null, pr: Number(d) }));
}

function blocked(clause, verbIndex) {
  if (clause.question) return "question";
  const t = clause.text;
  if (QUESTION_START_RE.test(t)) return "question";
  const before = t.slice(0, verbIndex);
  if (NEG_RE.test(before)) return "negated";
  if (SELF_RE.some((re) => re.test(before))) return "first-person";
  if (/\bready\s+to\s+$/i.test(before)) return "descriptive";
  return null;
}

/**
 * Parse owner text.
 * Returns { merges:[{repo,pr,anyway}], mergeContext:null|{scope:"one"|"all",anyway},
 *           deploys:[target], deployContext:bool, reviews:[{repo,pr}], reviewContext:bool,
 *           guards:null|"on"|"off", mentions:[{repo,pr}], skipped:[{text,reason}] }
 */
export function parseOwnerText(text, { defaultRepo = null } = {}) {
  const res = { merges: [], mergeContext: null, revokes: [], revokeContext: false, deploys: [], deployContext: false, reviews: [], reviewContext: false, guards: null, mentions: prRefs(text, defaultRepo), skipped: [] };
  for (const cl of clauses(text)) {
    const t = cl.text;

    const g = t.match(/\b(?:(guards?)\s+(off|on)|(disable|pause|turn\s+off|stop|enable|resume|turn\s+on|start)\s+(?:the\s+|all\s+)?(?:work[- ]ledger\s+)?guards?)\b/i);
    if (g) {
      const why = cl.question || QUESTION_START_RE.test(t) ? "question" : /\b(don'?t|do not|never|not)\b/i.test(t.slice(0, g.index)) ? "negated" : null;
      if (why) res.skipped.push({ text: t, reason: why });
      else {
        const word = (g[2] || g[3] || "").toLowerCase();
        res.guards = /off|disable|pause|stop/.test(word) ? "off" : "on";
      }
      continue;
    }

    const mv = MERGE_VERB_RE.exec(t);
    if (mv) {
      const why = blocked(cl, mv.index);
      const after = objectZone(t.slice(mv.index + mv[0].length));
      const deferred = !why && AFTER_NEG_RE.test(after);
      if (why === "negated" || deferred) {
        let refs = prRefs(after, defaultRepo);
        if (!refs.length) refs = bareNumbersAfterVerb(after, defaultRepo);
        if (!refs.length) refs = prRefs(t.slice(0, mv.index), defaultRepo);
        if (refs.length) refs.forEach((r) => { if (!res.revokes.some((x) => x.pr === r.pr && x.repo === r.repo)) res.revokes.push(r); });
        else if (ALL_OBJ_RE.test(after) || ONE_OBJ_RE.test(after) || FILLER_RE.test(after.replace(AFTER_NEG_RE, ""))) res.revokeContext = true;
      }
      if (why) res.skipped.push({ text: t, reason: why });
      else if (deferred) res.skipped.push({ text: t, reason: "deferred" });
      else if (NOUN_BEFORE_RE.test(t.slice(0, mv.index)) || NON_OBJECT_RE.test(after)) res.skipped.push({ text: t, reason: "noun" });
      else {
        const anyway = ANYWAY_RE.test(t);
        let refs = prRefs(after, defaultRepo);
        if (!refs.length) refs = bareNumbersAfterVerb(after, defaultRepo);
        const before = prRefs(t.slice(0, mv.index), defaultRepo);
        if (refs.length) refs.forEach((r) => res.merges.push({ ...r, anyway }));
        else if (ALL_OBJ_RE.test(after)) { if (before.length) before.forEach((r) => res.merges.push({ ...r, anyway })); else res.mergeContext = { scope: "all", anyway }; }
        else if (ONE_OBJ_RE.test(after) || FILLER_RE.test(after.replace(ANYWAY_RE, ""))) {
          if (before.length) before.forEach((r) => res.merges.push({ ...r, anyway }));
          else if (!NON_OBJECT_RE.test(after)) res.mergeContext = { scope: res.mergeContext?.scope === "all" ? "all" : "one", anyway };
        } else res.skipped.push({ text: t, reason: "no PR object" });
      }
    }

    const dv = DEPLOY_VERB_RE.exec(t);
    if (dv) {
      const why = blocked(cl, dv.index);
      const dAfter = objectZone(t.slice(dv.index + dv[0].length));
      if (why) res.skipped.push({ text: t, reason: why });
      else if (AFTER_NEG_RE.test(dAfter) && !/\bnow\b/i.test(t)) res.skipped.push({ text: t, reason: "deferred" });
      else if (NOUN_BEFORE_RE.test(t.slice(0, dv.index)) || DEPLOY_NON_OBJECT_RE.test(dAfter)) res.skipped.push({ text: t, reason: "noun" });
      else {
        const rest = t.slice(0, dv.index) + " " + dAfter;
        const found = [];
        for (const [name, re] of TARGETS) {
          if (re.test(rest)) {
            if (name === "play" && found.length) continue;
            found.push(name);
          }
        }
        if (found.length) found.forEach((x) => { if (!res.deploys.includes(x)) res.deploys.push(x); });
        else if (CONTEXT_DEPLOY_VERB_RE.test(dv[0]) && /^\s*(it|this|that|them|now|please)?[\s.!]*$/i.test(dAfter)) res.deployContext = true;
        else res.skipped.push({ text: t, reason: "no deploy target" });
      }
    }

    const rv = REVIEW_RE.exec(t);
    if (rv && REVIEW_MORE_RE.test(t)) {
      const why = blocked(cl, rv.index);
      if (why) res.skipped.push({ text: t, reason: why });
      else {
        const refs = prRefs(t, defaultRepo);
        if (refs.length) refs.forEach((r) => { if (!res.reviews.some((x) => x.pr === r.pr && x.repo === r.repo)) res.reviews.push(r); });
        else res.reviewContext = true;
      }
    }
  }
  return res;
}

export function hasAnyApproval(p) {
  return !!(p.merges.length || p.mergeContext || p.deploys.length || p.deployContext || p.reviews.length || p.reviewContext || p.guards);
}
