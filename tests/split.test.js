const test = require("node:test");
const assert = require("node:assert");
const { splitFile, readStatements, bytesToText } = require("../split.js");
const f = require("./fixtures.js");

const text = (out) => bytesToText(out.bytes);

test("an OFX 1 file with two bank accounts and a card gives three files", () => {
  const src = f.sgmlMulti();
  const { outputs, problems } = splitFile("export.ofx", f.bytes(src));
  assert.deepStrictEqual(problems, []);
  assert.deepStrictEqual(outputs.map((o) => o.name), [
    "export-checking-ending-3333.ofx", "export-savings-ending-6666.ofx", "export-card-ending-9876.ofx"]);
  assert.deepStrictEqual(outputs.map((o) => o.transactions), [2, 1, 2]);
  assert.deepStrictEqual(outputs.map((o) => [o.start, o.end]), [
    ["2026-09-01", "2026-09-30"], ["2026-09-01", "2026-09-30"], ["2026-09-05", "2026-09-28"]]);
});

test("each file keeps the header, the sign-on and its own statement exactly, and nothing else", () => {
  const src = f.sgmlMulti();
  const { outputs } = splitFile("export.ofx", f.bytes(src));
  const ids = ["111122223333", "444455556666", "4111000011119876"];
  outputs.forEach((o, i) => {
    const t = text(o);
    assert.ok(t.startsWith(f.SGML_HEAD + "\r\n<OFX>\r\n"), "header kept");
    assert.ok(t.includes(f.SIGNON), "sign-on kept");
    for (const [j, id] of ids.entries()) assert.strictEqual(t.includes("<ACCTID>" + id), i === j);
    assert.ok(t.trimEnd().endsWith("</OFX>"));
  });
  assert.ok(text(outputs[0]).includes(f.bankStmt("021000021", "111122223333", "CHECKING",
    [f.trn("20260902", -12.5, "C1", "Coffee &amp; Co"), f.trn("20260903", 1000, "C2", "Salary")])));
  assert.ok(text(outputs[2]).includes("<CREDITCARDMSGSRSV1>\r\n<CCSTMTTRNRS>"));
  assert.ok(!text(outputs[2]).includes("BANKMSGSRSV1"));
});

test("a split file reads back as a single account with the same transactions", () => {
  const { outputs } = splitFile("export.ofx", f.bytes(f.sgmlMulti()));
  for (const o of outputs) {
    const again = splitFile(o.name, o.bytes);
    assert.strictEqual(again.outputs.length, 1);
    assert.strictEqual(again.outputs[0].transactions, o.transactions);
    assert.deepStrictEqual(again.outputs[0].bytes, o.bytes);
  }
});

test("an OFX 2 XML file keeps its UTF-8 bytes and stays balanced", () => {
  const src = f.xmlMulti();
  const { outputs } = splitFile("all.QFX", new Uint8Array(Buffer.from(src, "utf8")));
  assert.deepStrictEqual(outputs.map((o) => o.name), ["all-checking-ending-0001.QFX", "all-card-ending-4444.QFX"]);
  const bank = Buffer.from(outputs[0].bytes);
  assert.ok(bank.includes(Buffer.from("<NAME>Café</NAME>", "utf8")));
  assert.ok(bank.toString("utf8").startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<?OFX '));
  for (const o of outputs) {
    const t = Buffer.from(o.bytes).toString("utf8");
    const opens = (t.match(/<[A-Z0-9.]+>/g) || []).length;
    const closes = (t.match(/<\/[A-Z0-9.]+>/g) || []).length;
    assert.strictEqual(opens, closes, o.name + " has every element closed");
  }
});

test("statements of the same account are kept together in one file", () => {
  const s1 = f.bankStmt("1", "777700001111", "CHECKING", [f.trn("20260801", -1, "A", "a")]);
  const s2 = f.bankStmt("1", "777700001111", "CHECKING", [f.trn("20260901", -2, "B", "b"), f.trn("20260902", -3, "C", "c")]);
  const src = f.SGML_HEAD + "\n<OFX>\n" + f.SIGNON + "\n<BANKMSGSRSV1>\n" + s1 + "\n" + s2 + "\n</BANKMSGSRSV1>\n</OFX>\n";
  const { outputs } = splitFile("x.ofx", f.bytes(src));
  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].transactions, 3);
  assert.ok(text(outputs[0]).includes(s1 + "\r\n" + s2), "the header's CRLF line end is reused");
});

test("lower-case tags and accounts with the same last four characters are handled", () => {
  const a = f.bankStmt("1", "10001234", "CHECKING", [f.trn("20260901", -1, "A", "a")]).toLowerCase();
  const b = f.bankStmt("1", "20001234", "CHECKING", [f.trn("20260901", -1, "B", "b")]).toLowerCase();
  const src = "<ofx>\n<bankmsgsrsv1>\n" + a + b + "\n</bankmsgsrsv1>\n</ofx>\n";
  const { outputs } = splitFile("y.ofx", f.bytes(src));
  assert.deepStrictEqual(outputs.map((o) => o.name), ["y-checking-ending-1234.ofx", "y-checking-ending-1234-2.ofx"]);
});

test("files that are not OFX, cut short, or without an account number are reported", () => {
  assert.throws(() => splitFile("a.csv", f.bytes("Date,Amount\n2026-09-01,3\n")), /does not look like an OFX/);
  assert.throws(() => splitFile("b.ofx", f.bytes(f.sgmlMulti().slice(0, 600))), /closing <\/OFX>/);
  const noId = f.bankStmt("1", "", "CHECKING", []);
  const src = "<OFX>\n<BANKMSGSRSV1>\n" + noId + f.cardStmt("4111222233334444", []) + "\n</BANKMSGSRSV1>\n</OFX>";
  const r = readStatements(f.bytes(src));
  assert.strictEqual(r.accounts.length, 0);
  assert.match(r.problems[0], /no account number/);
  assert.throws(() => splitFile("c.ofx", f.bytes("<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>")), /No bank, card or investment statement/);
});

test("an investment statement keeps the security list it refers to", () => {
  const inv = "<INVSTMTTRNRS><TRNUID>3<INVSTMTRS><DTASOF>20260930<CURDEF>USD<INVACCTFROM><BROKERID>broker.example<ACCTID>INV55667788</INVACCTFROM>"
    + "<INVTRANLIST><DTSTART>20260901<DTEND>20260930<INVBANKTRAN>" + f.trn("20260915", 15, "D1", "Dividend") + "<SUBACCTFUND>CASH</INVBANKTRAN></INVTRANLIST></INVSTMTRS></INVSTMTTRNRS>";
  const sec = "<SECLISTMSGSRSV1><SECLIST><STOCKINFO><SECINFO><SECID><UNIQUEID>123456789<UNIQUEIDTYPE>CUSIP</SECID><SECNAME>Example</SECINFO></STOCKINFO></SECLIST></SECLISTMSGSRSV1>";
  const src = "<OFX>\n" + f.SIGNON + "\n<BANKMSGSRSV1>\n" + f.bankStmt("1", "31415926", "CHECKING", []) + "\n</BANKMSGSRSV1>\n<INVSTMTMSGSRSV1>\n" + inv + "\n</INVSTMTMSGSRSV1>\n" + sec + "\n</OFX>\n";
  const { outputs } = splitFile("z.ofx", f.bytes(src));
  assert.deepStrictEqual(outputs.map((o) => o.name), ["z-checking-ending-5926.ofx", "z-investment-ending-7788.ofx"]);
  assert.ok(text(outputs[1]).includes(sec));
  assert.ok(!text(outputs[0]).includes("SECLIST"));
  assert.strictEqual(outputs[1].transactions, 1);
});
