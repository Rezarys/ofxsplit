# ofxsplit

Open in a recent browser, nothing to install: https://rezarys.github.io/ofxsplit/

A one-page tool that takes an OFX or QFX file holding several accounts and gives you one file per account, ready for Actual Budget's import dialog. The file is read in your browser and never leaves it.

Not affiliated with the Actual Budget project. The name is used here only to say which app reads these files.

## Why

Some banks and money apps export all your accounts into one OFX file. Actual imports a file into the one account you import from. From https://github.com/actualbudget/actual/issues/5524: "If I export multiple accounts into the same ofx file, ActualBudget does *not* do anything sensible with it, it will just ignore the ACCTID and put all the transactions into one ActualBudget account." The feature request is https://github.com/actualbudget/actual/issues/525.

In the Actual source read for this tool (master, October 2026, `packages/loot-core/src/server/transactions/import/ofx2json.ts`), the reader takes the credit card section if there is one, otherwise the investment section, otherwise the bank section, and joins the transactions of every statement in it. So two things happen with a multi-account file: all transactions go into one account, and when the file has both a bank account and a card, the bank transactions are not read at all.

## How to use it

1. Open https://rezarys.github.io/ofxsplit/ and choose your OFX or QFX file (or several).
2. The page lists the accounts it found: type, last four characters of the account number, number of transactions and dates.
3. Download the file for each account.
4. In Actual, open each account and import its file as usual.

No warranty: check the transactions after importing.

## What each file holds

The original header, the sign-on block, and that account's statements exactly as they were in your file. Only the wrapper around them is rebuilt. Statements of the same account are kept together. An investment account's file also keeps the security list. Bytes are copied as they are, so the file's declared encoding still applies.

## Status and limits

- Tested on example files written for the tests from the OFX specification (OFX 1 SGML with unclosed elements, OFX 2 XML, lower-case tags, investment statements). A separate check runs Actual's own `ofx2json.ts` (with xml2js 0.6.2) on those examples: on the whole file it reads only the card, and on each split file it reads exactly that account's transactions.
- The page has not been tried in a real browser, on a real bank export or in a running Actual. Please open an issue if it does not work for you, but do not attach or paste your real file: give the bank or app it comes from, the error shown, and if you can a few lines with account numbers, names and amounts replaced.
- A statement without an account number is left out and the page says so.
- Bank exports often bend the format. The page cuts the file at the statement tags, which both versions of the format always close, and stops with a message when it cannot find them.

## Possible later tool

For CSV files with several accounts, 3 USD, one time, not built yet: pick the column that names the account and get one CSV per account. Nothing is charged now and no date is promised. If you want it, say so on https://github.com/Rezarys/ofxsplit/issues/1 (free GitHub account needed). Not part of this repository and not covered by its license.

## Privacy

The file is read in your browser, and nothing in this page's code sends it anywhere. The page also sets a Content-Security-Policy (default-src 'none', connect-src 'none', form-action 'none') as a second guard. It is delivered with the page itself, so it only guards the code you were served. No cookies, no browser storage, no analytics, no third-party code.

## Development

Plain HTML, CSS and JavaScript, no build step, no library. Tests use Node's built-in test runner: `node --test tests/*.test.js`.

Built with AI assistance, tested with automated tests, not reviewed line by line.

## License

MIT, Younes Z.
