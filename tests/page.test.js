// Loads the page's scripts the way a browser does (one shared global scope) and drives the
// file input with a stub document, to catch name clashes and wiring errors without a browser.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const f = require("./fixtures.js");

const dir = path.join(__dirname, "..");
const src = (name) => fs.readFileSync(path.join(dir, name), "utf8");

test("the page scripts load together and list the accounts of a file", async () => {
  const els = {};
  const node = (props) => ({ textContent: "", className: "", children: [], handlers: {},
    addEventListener(t, fn) { this.handlers[t] = fn; }, appendChild(c) { this.children.push(c); }, ...props });
  const el = (id) => (els[id] ||= node({ id, value: "", files: [] }));
  const document = { getElementById: el, createElement: (tag) => node({ tag }), body: { appendChild() {} } };
  const ctx = vm.createContext({ document, TextDecoder, TextEncoder, Uint8Array, Map, Set, Promise, setTimeout, console, String });
  const html = src("index.html");
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepStrictEqual(scripts, ["split.js", "app.js"]);
  for (const s of scripts) vm.runInContext(src(s), ctx, { filename: s });
  for (const id of Object.keys(els)) assert.ok(html.includes('id="' + id + '"'), id + " is in the page");

  const bytes = f.bytes(f.sgmlMulti());
  const bad = f.bytes("Date,Amount\n");
  els.files.files = [
    { name: "export.ofx", arrayBuffer: async () => bytes.slice().buffer },
    { name: "notes.csv", arrayBuffer: async () => bad.slice().buffer },
  ];
  await els.files.handlers.change();
  assert.match(els.status.textContent, /^3 account\(s\) found in 1 file\(s\)\. notes\.csv: This does not look like an OFX/);
  assert.strictEqual(els.status.className, "");
  const box = els.list.children[0];
  assert.strictEqual(box.children[0].textContent, "export.ofx: 3 account(s)");
  const items = box.children[1].children;
  assert.strictEqual(items[0].children[0].textContent, "Download export-checking-ending-3333.ofx");
  assert.strictEqual(items[2].children[1].textContent, " card ending 9876, 2 transaction(s), 2026-09-05 to 2026-09-28");
});
