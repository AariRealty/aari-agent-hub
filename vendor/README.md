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
