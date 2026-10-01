// Example OFX files written by hand from the OFX specification for the tests. Account numbers are made up.

const SGML_HEAD = [
  "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252",
  "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
].join("\r\n");

function trn(date, amount, id, name) {
  return "<STMTTRN><TRNTYPE>" + (amount < 0 ? "DEBIT" : "CREDIT") + "<DTPOSTED>" + date + "120000"
    + "<TRNAMT>" + amount.toFixed(2) + "<FITID>" + id + "<NAME>" + name + "</STMTTRN>";
}

function bankStmt(bankId, acct, type, trns) {
  return "<STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>USD"
    + "<BANKACCTFROM><BANKID>" + bankId + "<ACCTID>" + acct + "<ACCTTYPE>" + type + "</BANKACCTFROM>"
    + "<BANKTRANLIST><DTSTART>20260901<DTEND>20260930" + trns.join("") + "</BANKTRANLIST>"
    + "<LEDGERBAL><BALAMT>100.00<DTASOF>20260930</LEDGERBAL></STMTRS></STMTTRNRS>";
}

function cardStmt(acct, trns) {
  return "<CCSTMTTRNRS><TRNUID>2<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS><CURDEF>USD"
    + "<CCACCTFROM><ACCTID>" + acct + "</CCACCTFROM>"
    + "<BANKTRANLIST><DTSTART>20260905<DTEND>20260928" + trns.join("") + "</BANKTRANLIST>"
    + "<LEDGERBAL><BALAMT>-50.00<DTASOF>20260928</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS>";
}

const SIGNON = "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261001120000"
  + "<LANGUAGE>ENG<FI><ORG>Example Bank<FID>1234</FI></SONRS></SIGNONMSGSRSV1>";

// OFX 1: two bank accounts and one card in one file, SGML with unclosed leaf elements, CRLF line ends.
function sgmlMulti() {
  const body = "<OFX>\r\n" + SIGNON + "\r\n<BANKMSGSRSV1>\r\n"
    + bankStmt("021000021", "111122223333", "CHECKING", [trn("20260902", -12.5, "C1", "Coffee &amp; Co"), trn("20260903", 1000, "C2", "Salary")]) + "\r\n"
    + bankStmt("021000021", "444455556666", "SAVINGS", [trn("20260910", 200, "S1", "Transfer in")]) + "\r\n"
    + "</BANKMSGSRSV1>\r\n<CREDITCARDMSGSRSV1>\r\n"
    + cardStmt("4111000011119876", [trn("20260906", -30, "K1", "Grocer"), trn("20260907", -20, "K2", "Books")]) + "\r\n"
    + "</CREDITCARDMSGSRSV1>\r\n</OFX>\r\n";
  return SGML_HEAD + "\r\n" + body;
}

// OFX 2: XML, every element closed, LF line ends, one bank account and one card.
function xmlMulti() {
  const close = (s) => s.replace(/<(TRNUID|CODE|SEVERITY|CURDEF|BANKID|ACCTID|ACCTTYPE|DTSTART|DTEND|TRNTYPE|DTPOSTED|TRNAMT|FITID|NAME|BALAMT|DTASOF|DTSERVER|LANGUAGE|ORG|FID)>([^<]*)/g, "<$1>$2</$1>");
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n'
    + "<OFX>\n" + close(SIGNON) + "\n<BANKMSGSRSV1>\n"
    + close(bankStmt("021000021", "99990001", "CHECKING", [trn("20260902", -5, "X1", "Café")])) + "\n</BANKMSGSRSV1>\n"
    + "<CREDITCARDMSGSRSV1>\n" + close(cardStmt("5500000000004444", [trn("20260906", -7, "Y1", "Bakery")])) + "\n</CREDITCARDMSGSRSV1>\n</OFX>\n";
}

function bytes(text) {
  return new Uint8Array(Buffer.from(text, "latin1"));
}

module.exports = { sgmlMulti, xmlMulti, bytes, SGML_HEAD, SIGNON, bankStmt, cardStmt, trn };
