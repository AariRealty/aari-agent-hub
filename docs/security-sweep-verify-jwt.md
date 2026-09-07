# Security sweep: the 104 edge functions running with verify_jwt off.
# Slice one of an ongoing pass. Resume marker is at the end.

# verify_jwt=false sweep. 104 functions, alphabetical. Resume marker at the bottom.
# Columns: slug | auth | writes | literal secret in source

1. aari-daily-digest v9
   auth: x-aari-cron header == realty_config.daily_digest_cron_secret, OR broker JWT (realty_members role=broker AND status=active). Real gate.
   writes: daily_digest_log (upsert). Reads ledger_entries, fixed_schedule, reconciliation_runs, realty_config.
   sends: email via Resend, but recipient is the hardcoded constant marlenyi@aarirealty.com. Caller cannot choose an address.
   literal secret: none. RESEND_API_KEY and service role from env.
   rank: operational data + sends to a human (broker only, fixed address).

2. aari-raa-pdf-email v14   *** SEVERITY 1. WORSE THAN generate-signed-agreement-pdf. ***
   auth: NONE. No header check, no secret, no JWT, no path guard. Deno.serve straight to the handler.
   writes: INSERTS a row into agreement_signatures (agreement_type referral_associate) with caller supplied
     name, email, licence, phone, initials and signature image. Uploads a PDF into the signed-agreements
     bucket. UPDATES agents.agreement_pdf_path for whatever agent matches the caller supplied email.
   sends: emails the caller supplied address a rendered signed agreement PDF, bcc Referrals@aarirealty.com,
     and SMSes EVERY agents row with role=broker via Twilio saying that person just signed.
   literal secret: none in source, but it holds Twilio and Resend credentials from env and will use them
     for an unauthenticated caller.
   rank: CAN ALTER A RECORD OF LEGAL SIGNIFICANCE, unauthenticated. Also sends to a human, unauthenticated.
   note: this is the one that manufactures an executed agreement out of nothing. Anyone who knows the URL
     can create a signature of record for a person who never signed, and text the broker that they did.

3. admin-resend-domains v12
   auth: query string token compared in code, ?t=aari-dom-0710. LITERAL SECRET IN SOURCE, and it travels
     in the URL, so it lands in every proxy and access log that sees the request.
   writes: nothing.
   sends: nothing.
   literal secret: YES, 'aari-dom-0710'.
   rank: read only. Exposes the Resend domain list and, through it, which sending domains are verified.

4. agent-request-tc-reassign v26
   auth: real. Bearer must be a valid session (auth.getUser) AND the caller must be files.agent_id.
   writes: files (assigned_tc_id, status, tc_reassign_count), file_tc_history.
   sends: nothing directly.
   literal secret: none.
   rank: operational data, properly authenticated. Nothing to do.

5. books-sync v16
   auth: x-sync-token header compared to a constant. LITERAL SECRET IN SOURCE.
   writes: nothing to the database.
   sends: nothing.
   literal secret: YES, SYNC_TOKEN = a 48 hex character constant on line 5.
   rank: read only, but what it reads is every SkySlope Books deal for the company with gross commission,
     company net and per agent payout. Rotating it means editing and redeploying the function.

6. cloze-sync-contacts v24
   auth: NONE. The header comment says "callable by pg_cron via service role" but no check exists.
   writes: DELETES every crm_followups_cache row for the broker, then bulk inserts replacements.
   sends: nothing.
   literal secret: none, CLOZE_API_KEY comes from env, but the key is put in the query string of the
     outbound Cloze calls.
   rank: can alter operational data, unauthenticated and destructive. An anonymous caller can wipe the
     broker's follow up cache, and can drive the brokerage's Cloze key against Cloze at will.

7. create-listing-checkout v2
   auth: none on the paying path, which is deliberate, it is a public checkout. The credit path does
     require a valid Bearer JWT.
   writes: UPDATES files (service_type, mls_names, stripe_checkout_session_id) for any file_id supplied,
     with no check that the caller has anything to do with that file. UPDATES memberships credits_used or
     activity_bonus_credits_remaining on the credit path. Creates Stripe Checkout Sessions.
   sends: nothing directly, Stripe emails the receipt.
   literal secret: none.
   rank: can alter operational data, unauthenticated. Two defects worth naming:
     a) any caller can rewrite service_type and mls_names on any file whose id they hold.
     b) on the credit path the agent is resolved by auth id first and then BY THE CALLER SUPPLIED EMAIL.
        An authenticated user whose auth id is not in agents can spend another agent's membership credit
        by passing that agent's email.

8. deadline-feed v11
   auth: capability token in the query string, agents.feed_token or files.client_feed_token. Legitimate
     for an .ics subscription, since calendar clients cannot send headers. An unknown token returns an
     empty calendar rather than an error, so it is not an enumeration oracle.
   writes: nothing.
   sends: nothing.
   literal secret: none.
   rank: read only. Correct as built.

9. decode-unsubscribe-token v26
   auth: capability token, profiles.unsub_token, supplied in the body. Legitimate for an unsubscribe link.
   writes: nothing. Reads profiles and email_preferences.
   sends: nothing.
   literal secret: none.
   rank: read only. It does return the email address for a valid token, which is the point of the page.

10. dev-hub-fetch v8   *** SEVERITY 2. A BUCKET WIDE READ ORACLE. ***
   auth: a constant compared in code, ?secret= or x-aari-dev. LITERAL SECRET IN SOURCE,
     'aari-dev-fetch-9d3f2a8b1c', and it is accepted in the query string.
   writes: nothing.
   sends: nothing.
   literal secret: YES.
   rank: read only, but it reads ANY object in ANY bucket with the service role and returns the contents,
     including signed-agreements and internal-assets. One hardcoded string stands between the public and
     every executed agreement in the company. Rotating it means editing and redeploying.

11. effective-date-confirm v20   *** SEVERITY 1. UNAUTHENTICATED WRITES TO CONTRACT DATES, AND AN OPEN RELAY. ***
   auth: the GET path uses a per file capability token, files.effective_date_confirm_token, which is
     correct for an email link. THE POST PATH HAS NO AUTHENTICATION AT ALL. Five operations sit behind it:
       op=heartbeat        writes system_pings.
       op=preview_deadlines takes ANY file_id and ANY 'to' address and EMAILS that address the file's
                            deadline schedule and property address. An open relay that also discloses
                            transaction data to whoever asks.
       op=dupcheck          reads files by address and returns the agent's name.
       op=reply             takes a ref token and a free text body, and will SET files.effective_date to a
                            date parsed out of that text, then mark it confirmed and email the agent.
       no op, file_id only  emails the file's agent the "confirm your effective date" message.
   writes: files.effective_date, files.effective_date_confirmed_at, files.deadlines_confirmed_at,
     files.logistics, tc_notifications, system_pings.
   sends: email via Resend to the file's agent, to the assigned TC, and on preview_deadlines to any
     address the caller names.
   literal secret: none.
   rank: CAN ALTER A RECORD OF LEGAL SIGNIFICANCE. effective_date is the date every contract deadline in
     the transaction is computed from. Also SENDS TO A HUMAN, unauthenticated, including to agents.
   note against the standing rule: this is a live path by which an agent can be contacted without anyone
     at the brokerage deciding to contact them.

12. eileen-daily-summary v21
   auth: NONE. GET or POST both run it.
   writes: nothing. Reads bd_contacts.
   sends: one email, to the hardcoded constant marlenyi@aarirealty.com. The caller cannot choose an
     address or influence the content.
   literal secret: none. FROM_EMAIL is still the Resend sandbox address onboarding@resend.dev.
   rank: sends to a human, but only to the broker at a fixed address. Worst case is that anyone who knows
     the URL can make her inbox receive the summary repeatedly.

13. email-flag v13
   auth: shared secret in the request body, compared in code. LITERAL SECRET IN SOURCE,
     "aari-eflag-7Kq2mZ9xR4vT8nP". Its counterpart lives in a Google Apps Script.
   writes: INSERTS file_email_flags rows against any file matched by an address substring.
   sends: nothing.
   literal secret: YES.
   rank: can alter operational data. The address match is a substring ilike, so a short address string
     attaches the flag to whichever active file matched most recently, not necessarily the right one.

14. file-action v5
   auth: HMAC SHA-256 over file:tc:action, verified with a constant time compare, key from
     FILE_ACTION_SECRET or the service role key. Correct, and the header comment explains why.
   writes: files.assigned_tc_id, files.tc_accepted_at. Guarded by is('tc_accepted_at', null) so the
     accept race is decided by the database.
   sends: nothing.
   literal secret: none.
   rank: operational data, properly authenticated. This is the model the other link functions should
     have followed.

15. friday-summary v19   *** SEVERITY 1 ON CONTACT. A MASS AGENT EMAIL WITH NO AUTHENTICATION. ***
   auth: NONE. The only gate is a time window, Friday 08:00 America/New_York, AND THE BODY FLAG
     { "force": true } SKIPS THE WINDOW.
   writes: files.friday_summary_sent_at.
   sends: one email PER AGENT to every agents row with weekly_digest_opt_in true and role 'agent'.
   literal secret: none.
   rank: SENDS TO A HUMAN, unauthenticated and in bulk. Anyone who knows the URL can make the brokerage
     email its whole agent roster, at any hour, as often as they like. Directly against the standing rule
     that an agent hears from the brokerage on their anniversary and on no other day.

16. generate-listing-description v26
   auth: NONE.
   writes: nothing.
   sends: nothing.
   literal secret: none, ANTHROPIC_API_KEY from env.
   rank: read only on our data, but it is an open proxy onto the brokerage's Anthropic key. Anyone who
     knows the URL can spend against that account without limit. A billing exposure, not a data one.

17. google-oauth-callback v32
   auth: a one time state nonce in agent_google_oauth_state, expiring in 10 minutes and deleted before
     the token exchange so it cannot be replayed. Unauthenticated by necessity, Google redirects here.
   writes: agent_google_calendar, including the Google access and refresh tokens.
   sends: nothing.
   literal secret: none. The project ref is hardcoded, which is not a secret.
   rank: operational data, correctly authenticated for what it is.

18. google-oauth-init v24
   auth: real. Bearer must be a valid session (auth.getUser). verify_jwt is off but the function does the
     same check itself.
   writes: agent_google_oauth_state (a nonce row for the caller's own agent id).
   sends: nothing.
   literal secret: none.
   rank: operational data, properly authenticated.

19. hash-stored-pdf v5
   auth: x-aari-cron header compared to realty_config.digest_cron_secret. Real gate, secret not in source.
   writes: nothing.
   sends: nothing.
   literal secret: none.
   rank: read only. Returns byte counts and SHA-256 for objects in signed-agreements, not their contents.
     Worth noting for the earlier finding: this is the only function that reads bucket objects as bytes
     rather than as text, so it is the only one that can speak accurately about a stored PDF at all.

20. hub-diag v9
   auth: x-aari-cron header compared to realty_config.digest_cron_secret. Real gate.
   writes: nothing.
   sends: nothing.
   literal secret: none.
   rank: read only. Reports byte counts and feature markers for the three realty-hub objects.

21. hub-diag-2026-07-14 v47   *** SEVERITY 1. AN ARBITRARY WRITE TOOL OVER EVERY BUCKET. ***
   auth: realty_config.digest_cron_secret, accepted in the x-aari-cron header OR IN THE QUERY STRING as
     ?cron=. The query string form puts the shared secret into every access log on the path.
   writes: with ?bucket= and ?file= naming ANY object in ANY bucket, it will
       replace=1  overwrite the object wholesale with base64 content from the URL or from realty_config
       patch=1    substitute one exact substring for another
       cut=1      delete a range between two markers
       restore=1  copy one object over another
     It also upserts realty_config (events_calendar_id) and can invoke gcal-sync with the service role key.
   sends: test_broadcast=1 calls realty-broadcast with the stored broadcast_token. It passes
     count_only true, so as written it counts rather than sends, but it is one parameter away.
   literal secret: none in source, but it reads three secrets out of realty_config and forwards them.
   rank: CAN ALTER A RECORD OF LEGAL SIGNIFICANCE. bucket=signed-agreements with file=<an executed ICA>
     and replace=1 overwrites that agreement. Nothing in the function limits it to realty-hub.
   note: the slug is a date. This was a one day diagnostic from 14 July that was never stood down, and it
     is now the most powerful unauthenticated-by-platform endpoint in the project.

22. hub-diag3 v8
   auth: x-aari-diag header compared to a constant. LITERAL SECRET IN SOURCE, 'marlenyi-audit-2026'.
   writes: nothing.
   sends: nothing.
   literal secret: YES, and it is a guessable phrase rather than a random value.
   rank: read only, scoped to hub_payload.html. Returns structure offsets and base64 context slices.

23. hub-file-io v23
   auth: x-io-secret compared against realty_config.hub_io_secret and hub_io_secret_next. No default and
     no literal. With neither key set it returns 503 and writes nothing, which is why publishing is
     currently closed. That is the fix from the previous pass working as intended.
   writes: realty-hub (any .html fragment, with an automatic backup), realty-brand (images and brand
     assets), signed-agreements (base agreement PDFs at the bucket root only, and it refuses to overwrite
     an existing version, returning 409).
   sends: nothing.
   literal secret: none, deliberately removed.
   rank: can alter operational data and, through the agreements route, publish a base agreement. Properly
     gated, path constrained, and it will not rewrite a published version. Correct as built.

24-25. hub-inject-broker v9, hub-inject-calendar v9
   auth: x-aari-cron header against realty_config.digest_cron_secret. Real gate.
   writes: hub_payload.html in realty-hub, in place and WITHOUT A BACKUP. Both are idempotent: they check
     for their own marker and return {already:true} if it is present, and both verify anchor counts and
     post-inject markers before writing, aborting rather than half-writing.
   sends: nothing.
   literal secret: none in source. hub-inject-calendar carries its whole payload as base64 constants.
   rank: can alter operational data, and what it alters is the document every agent's Hub is built from.
     Gated, idempotent, self checking, no backup.

26. hub-repair-body v6
   auth: x-aari-diag against the constant 'marlenyi-audit-2026'. LITERAL SECRET IN SOURCE, and it is the
     same phrase hub-diag3 uses.
   writes: hub_payload.html, with a backup to a fixed name hub_payload.BACKUP-2026-07-14-broken.html.
     It refuses unless it finds exactly three </body> and three </html>, which is a shape the file no
     longer has, so today it aborts with 409 before touching anything.
   sends: nothing.
   literal secret: YES.
   rank: can alter operational data, but inert against the current file. A finished one day repair that
     was never stood down.

27. hub-slice v9
   auth: x-aari-cron against realty_config.digest_cron_secret. Real gate.
   writes: nothing.  sends: nothing.  literal secret: none.
   rank: read only, scoped to the realty-hub bucket. Returns arbitrary slices of a named fragment.

28. hub-swap-home v10
   auth: x-aari-cron against realty_config.digest_cron_secret. Real gate.
   writes: hub_payload.html, no backup. Idempotent on id="agent-dash", anchor counted, marker verified.
   sends: nothing.  literal secret: none.
   rank: can alter operational data, the live Hub document.

29-31. hub-inject-financial v15, hub-inject-onboarding v7, hub-inject-txnguide v6
   auth: x-aari-cron compared to a hardcoded UUID. LITERAL SECRET IN SOURCE, and ALL THREE SHARE THE
     SAME ONE: '7d22996c-fc63-48e7-8087-95a56013d4a2'. It is not the realty_config cron secret, so it is
     a second, undocumented shared secret that no rotation procedure covers.
   writes: hub_payload.html, in place, NO BACKUP. Each strips its own paired markers and reinjects, so
     repeated calls are safe, but hub-inject-financial also takes ?remove=1 which strips its block and
     writes the file back without it.
   sends: nothing.
   literal secret: YES, one value across three functions.
   rank: can alter operational data. Anyone holding that one UUID can add or remove script blocks in the
     document every agent's Hub is built from. hub-inject-financial injects an iframe pointing at
     https://aari-financial-hub.netlify.app, so a third party origin is embedded in the broker's Hub.

32. hub-inject-txnguide, additional note
   Beyond injecting, it rewrites body text in hub_payload.html: every occurrence of
   "Find the Quick Transaction Guide in SkySlope" becomes "Find the Quick Transaction Guide". A content
   edit hidden inside a script injector.

33. ica-public-url v5
   auth: none, deliberately. It is what joinaari.com/ica-preview.html calls.
   writes: nothing.
   sends: nothing.
   literal secret: none.
   rank: read only. Correctly built: it reads base_pdf_path from the is_current version row only, rejects
     any path containing a slash so it can never reach a per agent executed copy, and returns a one hour
     signed URL to the blank agreement, which is public by design.

--- ALPHABETICAL SLICE ENDS HERE. Next to resume at: import-contract-from-email (position 34 of 104). ---

--- OUT OF ORDER, checked because the names flagged them as leftovers of the same family ---

temp-hub-peek v14, temp-hub-write v10, temp-money-fix v5, temp-money-grep v10, tmp-hub-storage-tool v10
   All five are already stood down to a one line stub returning 410. Nothing to do, and they are the
   precedent for what should happen to hub-diag-2026-07-14.

realty-hub-fileio v6 (list position 50)   *** SEVERITY 1. THE PUBLISHING LOCK HAS A SECOND DOOR. ***
   auth: x-aari-cron against realty_config.digest_cron_secret.
   writes: action 'write' and action 'patch' take a bucket name from the request body and default to
     realty-hub only if none is given. So bucket 'signed-agreements' with the path of an executed ICA and
     action 'write' overwrites that agreement. 'patch' does a find and replace with a timestamped backup.
   sends: nothing.
   literal secret: none.
   rank: CAN ALTER A RECORD OF LEGAL SIGNIFICANCE.
   why this matters most: the previous pass closed publishing by making hub-file-io require
     realty_config.hub_io_secret, which is unset, so hub-file-io writes nothing. This function reaches
     the same buckets through a different secret that IS set. The lock is real but it is on one of two
     doors. It also writes bytes through TextEncoder on a string, so a PDF written this way would be
     corrupted rather than replaced, which makes the failure worse rather than better.

put-frag v9 (list position 40)
   auth: x-aari-cron against realty_config.digest_cron_secret.
   writes: any object name into realty-hub from base64, upsert true, no backup, no path validation
     beyond requiring a name. Bucket is fixed to realty-hub.
   sends: nothing.  literal secret: none.
   rank: can alter operational data. Same door as above but confined to the Hub bucket.
