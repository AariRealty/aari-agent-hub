# vendor/

Third party code served from our own origin.

## Why

hub.joinaari.com used to load supabase-js from a public CDN. On 30 August a
request for it failed and the login page's script died on its first statement,
leaving the form to submit natively: the page reloaded, both fields cleared,
no error appeared, and nobody could sign in. A guard now stops that failing
silently, but the real fix is not depending on a host we have no contract with
to put an agent in front of their own files.

## What is here

| File | Package | Version | sha256 |
| --- | --- | --- | --- |
| `supabase-js-2.112.4.min.js` | `@supabase/supabase-js` | 2.112.4 | `f8ce7fab799af1916019cbd0b485b39bb80dbdbc6dc062909a751c9e5198e04c` |
| `pdfjs-3.11.174.min.js` | `pdfjs-dist` | 3.11.174 | `5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946` |
| `pdfjs-worker-3.11.174.min.js` | `pdfjs-dist` | 3.11.174 | `feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b` |
| `deadline-engine.js` | `aari-transactions-landing` | `32cc6a9` | `0efe0dad43777025e8c67a44f8eb9868a66d7486019c531459bf2fb3766f3b69` |

`deadline-engine.js` is the odd one out: it is ours, not a package. It is
vendored from `AariRealty/aari-transactions-landing`, `js/deadline-engine.js`,
and its header names the upstream commit and the sha256 of everything below the
header. `build/test-deadlines.js` recomputes that hash, so patching the engine
here instead of upstream fails the suite by name.

Why vendor our own file: the Hub used to pull it from `aaritransactions.com` on
every load, cross origin, with the script's `onerror` ignored. A failed fetch
left every card reading "No deadlines set", which is what a file with no
deadlines also reads. An absence must never be how a failure presents itself.

To re-pin: fix the engine in the transactions repo, push, then copy the file
here keeping only the header, update Commit and sha256 in that header, and run
`npm run test:deadlines`.

pdf.js reads the contract in the Contracts screen. It ships as two files and
both have to come from our own origin: the viewer, and the worker it parses in.
If the worker path is wrong pdf.js quietly falls back to the main thread, which
looks like it works until a twenty page contract locks the tab. The path is set
in `tx_module.html` and asserted in `build/test-contracts.js`.

Unlike supabase-js it is not loaded on every page. The Contracts screen injects
it on first open, because it is 320KB and most people never go there.

212426 bytes. Taken from `node_modules/@supabase/supabase-js/dist/umd/supabase.js`
after `npm install`, not downloaded from a CDN, so it comes from the registry
with the lockfile's integrity hash behind it.

## Upgrading, deliberately

There is no automatic update and that is the point. A floating `@2` is how a
third party changes the code your agents run without anybody deciding to.

To upgrade:

1. `npm i -D @supabase/supabase-js@<new version>`
2. `npm run vendor` writes the new file and prints its sha256
3. Update the `<script src>` in `index.html` to the new filename
4. Delete the old file
5. `npm run check`, which includes the sign in tests
6. Update the table above

Step 3 is manual on purpose. The filename carries the version, so the page
names exactly which build it runs and a stale cache cannot quietly serve a
different one.
