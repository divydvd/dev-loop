// Light shell splitter. It is not a full POSIX parser. It finds the real
// command words and ignores quoted text, comments and heredoc bodies, so
// `git commit -m "no rebase"` is not read as a rebase.

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const PREFIX_WORDS = new Set(["command", "builtin", "exec", "nohup", "time", "noglob", "then", "do", "else", "elif", "!", "if", "while", "until"]);

export function basename(p) {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function findClosingParen(src, i) {
  // i points just after "(" ; returns index of the matching ")" or src.length
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "'") { const j = src.indexOf("'", i + 1); i = j < 0 ? src.length : j + 1; continue; }
    if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; i++; }
      i++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
    i++;
  }
  return src.length;
}

function findClosingBrace(src, i) {
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return src.length;
}

function findBacktick(src, i) {
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (src[i] === "`") return i;
    i++;
  }
  return src.length;
}

/**
 * Split a shell string into simple commands.
 * Returns [{ argv, redirects:[{op,target}], heredoc?, raw, nested }]
 */
export function splitCommands(src, depth = 0) {
  const out = [];
  if (typeof src !== "string" || depth > 5) return out;
  const n = src.length;
  let i = 0;
  let words = [];
  let redirects = [];
  let cur = "";
  let inWord = false;
  let quoted = false;
  let expectTarget = null;
  let pendingHeredocs = [];
  let start = 0;
  const nested = [];

  const pushWord = () => {
    if (!inWord) return;
    if (expectTarget) {
      if (expectTarget === "<<" || expectTarget === "<<-") {
        pendingHeredocs.push({ delim: cur, strip: expectTarget === "<<-", cmd: null });
      } else {
        redirects.push({ op: expectTarget, target: cur });
      }
      expectTarget = null;
    } else {
      words.push(cur);
    }
    cur = ""; inWord = false; quoted = false;
  };

  const endCommand = (endIdx) => {
    pushWord();
    if (words.length || redirects.length) {
      const cmd = { argv: words, redirects, raw: src.slice(start, endIdx).trim(), nested: depth > 0 };
      out.push(cmd);
      for (const h of pendingHeredocs) if (!h.cmd) h.cmd = cmd;
    }
    words = []; redirects = []; start = endIdx + 1;
  };

  const addNested = (inner) => { for (const c of splitCommands(inner, depth + 1)) nested.push(c); };

  while (i < n) {
    const c = src[i];

    if (c === "\\") {
      if (src[i + 1] === "\n") { i += 2; continue; }
      if (i + 1 < n) { cur += src[i + 1]; inWord = true; }
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j < 0 ? n : j;
      cur += src.slice(i + 1, end); inWord = true; quoted = true;
      i = end + 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "'") {
      let j = i + 2; let s = "";
      while (j < n && src[j] !== "'") {
        if (src[j] === "\\" && j + 1 < n) { const e = src[j + 1]; s += e === "n" ? "\n" : e === "t" ? "\t" : e; j += 2; continue; }
        s += src[j]; j++;
      }
      cur += s; inWord = true; quoted = true; i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        const d = src[j];
        if (d === "\\" && j + 1 < n) {
          const e = src[j + 1];
          if (e === '"' || e === "\\" || e === "$" || e === "`") { cur += e; j += 2; continue; }
          if (e === "\n") { j += 2; continue; }
          cur += d; j++; continue;
        }
        if (d === "$" && src[j + 1] === "(") {
          if (src[j + 2] === "(") { const k = findClosingParen(src, j + 3); const k2 = findClosingParen(src, k + 1); cur += src.slice(j, Math.min(n, k2 + 1)); j = k2 + 1; continue; }
          const k = findClosingParen(src, j + 2);
          addNested(src.slice(j + 2, k));
          cur += "$(…)"; j = k + 1; continue;
        }
        if (d === "$" && src[j + 1] === "{") { const k = findClosingBrace(src, j + 2); cur += src.slice(j, Math.min(n, k + 1)); j = k + 1; continue; }
        if (d === "`") { const k = findBacktick(src, j + 1); addNested(src.slice(j + 1, k)); cur += "`…`"; j = k + 1; continue; }
        cur += d; j++;
      }
      inWord = true; quoted = true; i = j + 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "(") {
      if (src[i + 2] === "(") {
        const k = findClosingParen(src, i + 3); const k2 = findClosingParen(src, k + 1);
        cur += src.slice(i, Math.min(n, k2 + 1)); inWord = true; i = k2 + 1; continue;
      }
      const k = findClosingParen(src, i + 2);
      addNested(src.slice(i + 2, k));
      cur += "$(…)"; inWord = true; i = k + 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "{") {
      const k = findClosingBrace(src, i + 2);
      cur += src.slice(i, Math.min(n, k + 1)); inWord = true; i = k + 1;
      continue;
    }
    if (c === "`") {
      const k = findBacktick(src, i + 1);
      addNested(src.slice(i + 1, k));
      cur += "`…`"; inWord = true; i = k + 1;
      continue;
    }
    if ((c === "<" || c === ">") && src[i + 1] === "(") {
      pushWord();
      const k = findClosingParen(src, i + 2);
      addNested(src.slice(i + 2, k));
      words.push("<(…)"); i = k + 1;
      continue;
    }
    if (c === "#" && !inWord) {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") { pushWord(); i++; continue; }
    if (c === "\n") {
      endCommand(i);
      i++;
      if (pendingHeredocs.length) {
        for (const h of pendingHeredocs) {
          const lines = [];
          while (i < n) {
            let e = src.indexOf("\n", i);
            if (e < 0) e = n;
            let line = src.slice(i, e);
            i = e + 1;
            const cmpLine = h.strip ? line.replace(/^\t+/, "") : line;
            if (cmpLine === h.delim) break;
            lines.push(line);
          }
          if (h.cmd) h.cmd.heredoc = (h.cmd.heredoc ? h.cmd.heredoc + "\n" : "") + lines.join("\n");
        }
        pendingHeredocs = [];
        start = i;
      }
      continue;
    }
    if (c === ";") { endCommand(i); i += src[i + 1] === ";" ? 2 : 1; start = i; continue; }
    if (c === "&") {
      if (src[i + 1] === "&") { endCommand(i); i += 2; start = i; continue; }
      if (src[i + 1] === ">") {
        pushWord();
        const op = src[i + 2] === ">" ? "&>>" : "&>";
        expectTarget = op; i += op.length; continue;
      }
      endCommand(i); i++; start = i; continue;
    }
    if (c === "|") {
      endCommand(i);
      i += (src[i + 1] === "|" || src[i + 1] === "&") ? 2 : 1; start = i;
      continue;
    }
    if (c === "(" || c === ")") { endCommand(i); i++; start = i; continue; }
    if (c === ">" || c === "<") {
      if (inWord && !quoted && /^\d+$/.test(cur)) { cur = ""; inWord = false; }
      else pushWord();
      let op;
      const rest = src.slice(i, i + 3);
      if (rest.startsWith("<<<")) op = "<<<";
      else if (rest.startsWith("<<-")) op = "<<-";
      else if (rest.startsWith("<<")) op = "<<";
      else if (rest.startsWith(">>")) op = ">>";
      else if (rest.startsWith(">&") || rest.startsWith("<&")) {
        let j = i + 2; while (j < n && /[0-9-]/.test(src[j])) j++;
        if (j > i + 2) { i = j; continue; }
        op = rest.slice(0, 2);
      }
      else if (rest.startsWith(">|") || rest.startsWith("<>")) op = rest.slice(0, 2);
      else op = c;
      expectTarget = op; i += op.length;
      continue;
    }
    cur += c; inWord = true; i++;
  }
  endCommand(n);

  // Heredoc bodies fed to a shell are code, so read them too.
  const result = [];
  for (const cmd of out) {
    result.push(cmd);
    if (cmd.heredoc && SHELLS.has(basename(unwrap(cmd.argv).argv[0] || ""))) {
      for (const c2 of splitCommands(cmd.heredoc, depth + 1)) result.push(c2);
    }
  }
  return result.concat(nested);
}

function skipOpts(argv, i, withValue) {
  while (i < argv.length && argv[i].startsWith("-") && argv[i] !== "-") {
    const w = argv[i];
    if (w === "--") return i + 1;
    if (withValue.has(w)) i += 2; else i += 1;
  }
  return i;
}

/**
 * Remove wrappers (env vars, sudo, timeout, xargs, bundle exec, ...).
 * Returns { argv, inline: [strings to parse as nested shell code] }.
 */
export function unwrap(argvIn) {
  let argv = argvIn.slice();
  const inline = [];
  for (let guard = 0; guard < 12 && argv.length; guard++) {
    while (argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) argv.shift();
    while (argv.length && (argv[0] === "{" || argv[0] === "}")) argv.shift();
    if (!argv.length) break;
    const w = basename(argv[0]);
    if (PREFIX_WORDS.has(w)) { argv = argv.slice(1); if (w === "command" || w === "exec") argv = argv.slice(skipOpts(argv, 0, new Set(["-a"]))); continue; }
    if (w === "env") {
      let i = 1;
      while (i < argv.length) {
        const a = argv[i];
        if (a === "-u" || a === "-P" || a === "-S" || a === "-C") { i += 2; continue; }
        if (a.startsWith("-")) { i++; continue; }
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) { i++; continue; }
        break;
      }
      argv = argv.slice(i); continue;
    }
    if (w === "sudo") { argv = argv.slice(skipOpts(argv, 1, new Set(["-u", "-g", "-h", "-p", "-C", "-U"]))); continue; }
    if (w === "timeout" || w === "gtimeout") { let i = skipOpts(argv, 1, new Set(["-s", "-k", "--signal", "--kill-after"])); argv = argv.slice(i + 1); continue; }
    if (w === "nice") { argv = argv.slice(skipOpts(argv, 1, new Set(["-n"]))); continue; }
    if (w === "caffeinate") { argv = argv.slice(skipOpts(argv, 1, new Set(["-t", "-w"]))); continue; }
    if (w === "stdbuf" || w === "unbuffer") { argv = argv.slice(skipOpts(argv, 1, new Set())); continue; }
    if (w === "arch") { argv = argv.slice(skipOpts(argv, 1, new Set())); continue; }
    if (w === "lockf") { const i = skipOpts(argv, 1, new Set(["-t"])); argv = argv.slice(i + 1); continue; }
    if (w === "xargs") { argv = argv.slice(skipOpts(argv, 1, new Set(["-n", "-I", "-J", "-L", "-P", "-s", "-d", "-E", "-R", "-S"]))); continue; }
    if (w === "watch") { const i = skipOpts(argv, 1, new Set(["-n", "-d"])); inline.push(argv.slice(i).join(" ")); argv = []; break; }
    if ((w === "npx" || w === "bunx" || w === "pnpx")) {
      let i = 1;
      while (i < argv.length && argv[i].startsWith("-")) { if (argv[i] === "-p" || argv[i] === "--package") i += 2; else i++; }
      argv = argv.slice(i);
      if (argv.length && /^firebase-tools(@.*)?$/.test(argv[0])) argv[0] = "firebase";
      continue;
    }
    if (w === "bundle" && argv[1] === "exec") { argv = argv.slice(2); continue; }
    if (w === "eval") { inline.push(argv.slice(1).join(" ")); argv = []; break; }
    if (SHELLS.has(w)) {
      let i = 1;
      let codeAt = -1;
      while (i < argv.length && argv[i].startsWith("-")) {
        const a = argv[i];
        if (a === "-o" || a === "+o" || a === "-O" || a === "+O") { i += 2; continue; }
        if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a)) { codeAt = i + 1; i++; break; }
        i++;
      }
      if (codeAt > 0 && codeAt < argv.length) { inline.push(argv[codeAt]); argv = []; break; }
      if (i < argv.length && /(^|\/)gradlew$/.test(argv[i])) { argv = argv.slice(i); continue; }
      break;
    }
    break;
  }
  return { argv, inline };
}

/** Full analysis: simple commands after unwrapping, with inline code expanded. */
export function commandsOf(src, depth = 0) {
  const result = [];
  if (depth > 4) return result;
  for (const c of splitCommands(src, depth)) {
    const { argv, inline } = unwrap(c.argv);
    if (argv.length) result.push({ argv, redirects: c.redirects, raw: c.raw, heredoc: c.heredoc, nested: c.nested || depth > 0 });
    else if (c.redirects.length) result.push({ argv: [], redirects: c.redirects, raw: c.raw, heredoc: c.heredoc, nested: c.nested || depth > 0 });
    for (const code of inline) for (const r of commandsOf(code, depth + 1)) result.push({ ...r, nested: true });
  }
  return result;
}

export function shQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
