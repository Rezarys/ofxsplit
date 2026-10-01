"use strict";
// Splits an OFX or QFX file that holds several accounts into one file per account.
// The text of each statement is copied as is; only the wrapper around it is rebuilt.
// Files are handled as Latin-1 strings, one character per byte, so the output keeps the
// input's exact bytes (and its declared encoding) whatever that encoding is.

const MESSAGE_SETS = [
  { set: "BANKMSGSRSV1", rs: "STMTTRNRS", from: "BANKACCTFROM", kind: "bank" },
  { set: "CREDITCARDMSGSRSV1", rs: "CCSTMTTRNRS", from: "CCACCTFROM", kind: "card" },
  { set: "INVSTMTMSGSRSV1", rs: "INVSTMTTRNRS", from: "INVACCTFROM", kind: "investment" },
];

function bytesToText(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return s;
}

function textToBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255;
  return out;
}

// Every aggregate <TAG>...</TAG> at any depth inside text, as [start, end) offsets.
function blocks(text, tag, from, to) {
  const found = [];
  const open = new RegExp("<" + tag + "\\s*>", "gi");
  const close = new RegExp("</" + tag + "\\s*>", "gi");
  open.lastIndex = from || 0;
  const stop = to === undefined ? text.length : to;
  let m;
  while ((m = open.exec(text)) && m.index < stop) {
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(text);
    if (!c || c.index >= stop) {
      found.push({ start: m.index, end: -1 });
      break;
    }
    found.push({ start: m.index, end: c.index + c[0].length });
    open.lastIndex = c.index + c[0].length;
  }
  return found;
}

// Value of a leaf element; works whether or not the element has a closing tag (OFX 1 SGML or OFX 2 XML).
function leaf(text, tag) {
  const m = new RegExp("<" + tag + "\\s*>([^<\\r\\n]*)", "i").exec(text);
  return m ? m[1].trim() : "";
}

function day(value) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value || "");
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
}

function count(text, tag) {
  const m = text.match(new RegExp("<" + tag + "\\s*>", "gi"));
  return m ? m.length : 0;
}

function lastFour(id) {
  const clean = id.replace(/[^0-9A-Za-z]/g, "");
  return clean.slice(-4) || "x";
}

// Reads one file. Returns { accounts: [...], problems: [...] } or throws an Error with a message for the reader.
function readStatements(bytes) {
  const text = bytesToText(bytes);
  const ofxOpen = /<OFX\s*>/i.exec(text);
  if (!ofxOpen) throw new Error("This does not look like an OFX or QFX file (no <OFX> tag found).");
  const ofxClose = /<\/OFX\s*>/i.exec(text.slice(ofxOpen.index));
  if (!ofxClose) throw new Error("The file ends before its closing </OFX> tag; it may be cut short.");
  const bodyStart = ofxOpen.index + ofxOpen[0].length;
  const bodyEnd = ofxOpen.index + ofxClose.index;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const signon = blocks(text, "SIGNONMSGSRSV1", bodyStart, bodyEnd)[0];
  const seclist = blocks(text, "SECLISTMSGSRSV1", bodyStart, bodyEnd)[0];
  const accounts = new Map();
  const problems = [];
  for (const ms of MESSAGE_SETS) {
    for (const set of blocks(text, ms.set, bodyStart, bodyEnd)) {
      if (set.end < 0) { problems.push("A <" + ms.set + "> section is not closed."); continue; }
      for (const b of blocks(text, ms.rs, set.start, set.end)) {
        if (b.end < 0) { problems.push("A <" + ms.rs + "> statement is not closed and was left out."); continue; }
        const chunk = text.slice(b.start, b.end);
        const fromBlock = blocks(chunk, ms.from)[0];
        const fromText = fromBlock && fromBlock.end > 0 ? chunk.slice(fromBlock.start, fromBlock.end) : "";
        const id = leaf(fromText, "ACCTID");
        if (!id) { problems.push("A " + ms.kind + " statement has no account number and was left out."); continue; }
        const bankId = leaf(fromText, "BANKID") || leaf(fromText, "BROKERID");
        const type = leaf(fromText, "ACCTTYPE");
        const key = ms.kind + "|" + bankId + "|" + id + "|" + type;
        if (!accounts.has(key)) {
          accounts.set(key, { kind: ms.kind, set: ms.set, id, bankId, type, last4: lastFour(id),
            parts: [], transactions: 0, start: "", end: "" });
        }
        const a = accounts.get(key);
        a.parts.push(chunk);
        a.transactions += count(chunk, "STMTTRN");
        const s = day(leaf(chunk, "DTSTART"));
        const e = day(leaf(chunk, "DTEND"));
        if (s && (!a.start || s < a.start)) a.start = s;
        if (e && (!a.end || e > a.end)) a.end = e;
      }
    }
  }
  const list = [...accounts.values()];
  if (!list.length && !problems.length) throw new Error("No bank, card or investment statement was found in this file.");
  return {
    accounts: list,
    problems,
    head: text.slice(0, ofxOpen.index),
    ofxTag: ofxOpen[0],
    signon: signon && signon.end > 0 ? text.slice(signon.start, signon.end) : "",
    seclist: seclist && seclist.end > 0 ? text.slice(seclist.start, seclist.end) : "",
    eol,
  };
}

// Builds the text of a one-account file: same header, same sign-on, the account's statements only.
function accountFile(read, account) {
  const e = read.eol;
  let out = read.head + read.ofxTag + e;
  if (read.signon) out += read.signon + e;
  out += "<" + account.set + ">" + e + account.parts.join(e) + e + "</" + account.set + ">" + e;
  if (account.kind === "investment" && read.seclist) out += read.seclist + e;
  out += "</OFX>" + e;
  return out;
}

function label(account) {
  const kind = account.kind === "bank" && account.type ? account.type.toLowerCase() : account.kind;
  return kind + " ending " + account.last4;
}

// One output per account: { name, label, bytes, transactions, start, end }.
function splitFile(fileName, bytes) {
  const read = readStatements(bytes);
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : ".ofx";
  const used = new Set();
  const outputs = read.accounts.map((a) => {
    const slug = label(a).replace(/[^0-9A-Za-z]+/g, "-");
    let name = base + "-" + slug + ext;
    for (let n = 2; used.has(name); n++) name = base + "-" + slug + "-" + n + ext;
    used.add(name);
    return { name, label: label(a), bytes: textToBytes(accountFile(read, a)), transactions: a.transactions,
      start: a.start, end: a.end };
  });
  return { outputs, problems: read.problems };
}

if (typeof module !== "undefined") module.exports = { readStatements, accountFile, splitFile, bytesToText, textToBytes, leaf, blocks };
