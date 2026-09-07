# Security sweep: the 104 edge functions running with verify_jwt off.
# Resume marker at the end of the file.
#
# EVERY SECRET VALUE IN THIS FILE IS REDACTED, AND WAS NOT REDACTED IN THE FIRST
# TWO COMMITS OF IT. This repository is PUBLIC. Between commit 8a89886 and this
# one, eleven literal credentials were quoted here in full and pushed to a public
# GitHub repository. That was my error and it made the exposure worse rather than
# better. Redacting them here does not remove them from git history. Every value
# that appeared here must be treated as compromised and rotated. The list is in
# the report and in docs/credential-exposure.md.

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
   auth: query string token compared in code, ?t=<query string token, REDACTED>. LITERAL SECRET IN SOURCE, and it travels
     in the URL, so it lands in every proxy and access log that sees the request.
   writes: nothing.
   sends: nothing.
   literal secret: YES, '<query string token, REDACTED>'.
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
     '<dev-hub-fetch secret, REDACTED>', and it is accepted in the query string.
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
     "<email-flag secret, REDACTED>". Its counterpart lives in a Google Apps Script.
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
   auth: x-aari-diag header compared to a constant. LITERAL SECRET IN SOURCE, '<a guessable phrase, REDACTED>'.
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
   auth: x-aari-diag against the constant '<a guessable phrase, REDACTED>'. LITERAL SECRET IN SOURCE, and it is the
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
     SAME ONE: '<a UUID shared by three functions and one cron row, REDACTED>'. It is not the realty_config cron secret, so it is
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

================================================================================
SLICE TWO. Resumed at position 34.
================================================================================

34. import-contract-from-email v12
   auth: x-import-secret compared to a constant. LITERAL SECRET IN SOURCE,
     "<import secret, REDACTED>". Its counterpart lives in a Gmail Apps Script.
   writes: INSERTS files rows, INSERTS file_documents rows, UPDATES files
     (raw_form_data, file_type, service_type, status including archived and
     triage_needed), uploads PDFs into the transaction-files bucket, and invokes
     extract-contract-fields with the service role key.
   sends: nothing.
   literal secret: YES.
   rank: can alter operational data, heavily. One string lets a caller create files,
     attach documents to any file matched by a street address in a subject line, and
     archive an existing active file as a duplicate.
   defect worth naming: there is a dead call, admin.rpc("noop_placeholder"), wrapped in
     a try that swallows. It is a leftover that fires a failing RPC on every import
     carrying a message_id. Harmless but it is noise in the logs pretending to be code.

35. loan-deadline-ping v15
   auth: NONE. The only gate is an 08:00 America/New_York hour check AND
     { "force": true } SKIPS IT, same shape as friday-summary.
   writes: files.loan_ping_last_sent_at.
   sends: SMS via Twilio to the assigned TC's phone, falling back to every agents row
     with role='broker'. One message per eligible financed sale file.
   literal secret: none.
   rank: SENDS TO A HUMAN, unauthenticated and in bulk. Partly self limiting: the
     per file per day dedup stamp means a second call the same day sends nothing, so
     an attacker gets one burst per day rather than unlimited. The first burst is real.

36. platform-alert-action v1
   auth: an unguessable random uuid token in the query string, single use, enforced by
     executed_at, expiring after 30 days. Deliberate and correct for an email button,
     and the header comment reasons about it properly.
   writes: platform_alert_mutes via rpc, files.raw_form_data.co_invoice_approved via
     rpc, platform_alert_actions.executed_at.
   sends: nothing.
   literal secret: none.
   rank: can alter operational data, correctly gated by capability token.

37. platform-alert-inbound v1   *** SEVERITY 1. A FAIL OPEN SECRET CHECK ON A FINANCIAL APPROVAL. ***
   auth: two checks, and neither holds.
     a) The shared secret is only compared IF the env var is set:
          if (INBOUND_SECRET) { ...compare... }
        An unset PLATFORM_ALERT_INBOUND_SECRET means no check at all. Fail open.
     b) The sender check reads payload.from, WHICH THE CALLER SUPPLIES IN THE JSON BODY.
        Comparing attacker controlled data against ALERT_TO proves nothing.
   writes: platform_alert_mutes, and files.raw_form_data.co_invoice_approved through
     platform_alert_mark_coinvoice_approved, which is a money decision.
   sends: nothing.
   literal secret: none, and that is the problem, there is no secret at all.
   rank: CAN ALTER OPERATIONAL DATA AND A MONEY DECISION, effectively unauthenticated.
   CONFIRMED BY BEHAVIOUR, 7 September: a POST carrying no ?s= parameter and a
     self declared from address of marlenyi@aarirealty.com passed both checks and
     reached the token lookup, returning skipped:"action_not_found". The secret is
     not set. The only thing standing between the public and an approval is guessing
     a uuid. One live unexecuted token exists today, a mute, expiring 2 October.

38. preview-tc-invoice v13   *** SEVERITY 1 ON CONTACT. AN OPEN RELAY ON A VERIFIED DOMAIN. ***
   auth: NONE.
   writes: nothing.
   sends: one email per call, from "Aari Transactions <invoices@aaritransactions.com>",
     TO AN ADDRESS THE CALLER NAMES in body.to, defaulting to marlenyi@aarirealty.com,
     with the invoice number, period, coordinator name, line items and dollar amounts
     ALL SUPPLIED BY THE CALLER. If the verified domain is refused it silently retries
     from onboarding@resend.dev.
   literal secret: none.
   rank: SENDS TO A HUMAN, unauthenticated, to any address, with fully attacker
     controlled content, wearing the brokerage's own verified sending domain. This is
     not a data leak, it is a phishing instrument with Aari's return address on it, and
     it burns the domain's sending reputation while it does it.

39. public-submit v36
   auth: none by design, it is the public intake form. It DOES honour a Bearer token when
     one is present and upgrades the submission to portal_authenticated, which is the
     right shape for a public form.
   writes: INSERTS files rows, uploads PDFs to transaction-files, writes system_pings,
     invokes extract-contract-fields with the service role key.
   sends: a confirmation email to the caller supplied agent_email, and an intake ping to
     the fixed INTAKE_PING_TO address. Both bounded, the confirmation goes only to the
     address that submitted.
   literal secret: none.
   rank: CAN ALTER A RECORD OF LEGAL SIGNIFICANCE, through one intent. intent 'sa_pdf'
     forwards a caller supplied typed name, email, licence and signature image to
     aari-sa-pdf-email with the service role key. That is the Service Agreement signing
     path, reachable from an unauthenticated public endpoint, the same shape as
     aari-raa-pdf-email. The file creation and the emails are fine. The signing intent
     sitting inside a public intake handler is not.

47. realty-broadcast v10 (read out of order, it is the one the standing rule is about)
   *** SEVERITY 1 ON CONTACT. THE WHOLE ROSTER, ARBITRARY CONTENT, ONE LITERAL. ***
   auth: a token in the request body compared to a constant. TWO LITERAL SECRETS IN SOURCE:
     BROADCAST_TOKEN = '<broadcast token, REDACTED>'
     UNSUB_SECRET    = '<unsubscribe secret, REDACTED>'
     realty_config.broadcast_token is 17 characters, exactly the length of the first one,
     so the credential is stored twice, once in a table and once in deployed source. Two
     copies of a fact that can drift, and this one is a key.
   writes: realty_broadcasts (the send log).
   sends: an email with a CALLER SUPPLIED SUBJECT AND CALLER SUPPLIED HTML, from
     "Marlenyi at Aari Realty <onboarding@aarirealty.com>", reply-to marlenyi@aarirealty.com,
     to either every non unsubscribed row in realty_leads, or TO ANY LIST OF ADDRESSES THE
     CALLER PROVIDES in body.recipients, which skips the leads table and its source filters
     entirely. Batched 100 at a time through the Resend batch endpoint.
   literal secret: YES, two.
   rank: SENDS TO A HUMAN. Every agent, by name, with anything the caller writes, signed as
     the broker. This is the exact capability the standing rule exists to prevent, and it is
     held by a nineteen character string that is printed in deployed source.
   second defect: because UNSUB_SECRET is a literal, the unsubscribe token is a SHA-256 of
     the lowercased email plus a public constant. Anyone can compute anyone's unsubscribe
     link and remove them from the list, or verify that a given address is on it.

43. realty-agent-welcome v10 (read out of order alongside realty-broadcast)
   auth: x-aari-cron against realty_config.digest_cron_secret. Real gate, no literal.
   writes: CHANGES THE AGENT'S AUTH PASSWORD via auth.admin.updateUserById, sets
     realty_members.must_change_password, and attempts an audit_log insert.
   sends: TWO emails to the agent. One attaches their EXECUTED ICA as a PDF. One carries a
     fresh temporary password in plain text.
   literal secret: none.
   rank: sends to a human, and hands out both a credential and an executed agreement.

   *** A SECOND ad-inc-big. THE RESEND GUARD HAS NEVER WORKED. ***
   The dedup is: look for an audit_log row with action 'realty_agent_welcome_sent' and
   return { already: true } if one exists. The write that would create that row uses
     actor_type: 'hub_welcome'
   and audit_log_actor_type_check allows only agent, tc, broker, admin, system,
   realty_member, realty_broker. Every insert violates the constraint. It is wrapped in
   catch(_e){} so nothing surfaces. Confirmed: zero rows in audit_log with that action,
   ever.
   Consequence, and it is not theoretical: every call for the same agent re-randomises
   their password, locking out anyone already signed in, and re-sends both emails
   including their executed agreement, because 'already' can never fire. The function
   believes it is idempotent and it is not.
   The fix is one word, 'hub_welcome' becomes 'system'. NOT APPLIED. Reporting only,
   per the brief.

   Same trap as realty-agent-invite: preview:true still SENDS both emails. It only
   substitutes a sample password and skips the password change. It previews the content,
   not the sending.

41. realty-agent-join v12
   auth: real Stripe webhook signature. HMAC SHA-256 over t.body, a 300 second timestamp
     window, and a constant time compare. Correctly built.
   writes: nothing directly. It calls realty-agent-provision.
   sends: nothing directly.
   literal secret: YES. PROVISION_TOKEN = '<provision token, REDACTED>' is printed here, which
     is the credential for the account creation path below.
   rank: operational, correctly authenticated, but it carries someone else's key in clear.

42. realty-agent-provision v21   *** SEVERITY 1. ACCOUNT CREATION BEHIND A PRINTED STRING. ***
   auth: a token in the request body compared to a constant.
     THREE LITERAL SECRETS IN SOURCE:
       PROVISION_TOKEN      = '<provision token, REDACTED>'
       MANUAL_PROVISION_KEY = '<manual provision key, REDACTED>'
     and the same PROVISION_TOKEN again in realty-agent-join. The in-file comment claims
     MANUAL_PROVISION_KEY "is known only to realty-provision-pending-agent". It is printed
     four lines below the claim, in the same deployed file.
   writes: CREATES an auth.users account with email_confirm true, and INSERTS a
     realty_members row with role 'agent', status 'active', a commission_plan and an
     agent_split. Its own comment calls it "the single write path for realty_members
     inserts from every join/provision route in the system".
   sends: an email to the new account with its temporary password, and failure notices to
     the broker.
   literal secret: YES, two here plus one shared.
   rank: CAN ALTER A RECORD OF LEGAL SIGNIFICANCE and grant Hub access. A twenty two
     character string that is printed in deployed source creates a live, active, plan
     bearing member of the brokerage. status='active' is exactly what the realty-hub gate
     checks, so a forged member is inside the Hub.

   Note the family: '<broadcast token, REDACTED>' and '<provision token, REDACTED>' share a suffix, so
   holding one narrows the search for the other.

--- A PATTERN, NOT THREE BUGS: THE AUDIT TRAIL SILENTLY REFUSES MADE UP ACTOR TYPES ---
audit_log_actor_type_check allows only: agent, tc, broker, admin, system, realty_member,
realty_broker. Confirmed by query, the only values ever actually written are broker,
realty_broker, realty_member, system, tc.
Functions writing a value outside that list, each inside an empty catch, so nothing
surfaces and the row never lands:
  realty-agent-welcome   actor_type 'hub_welcome'            0 rows ever, AND it is the
                                                             dedup this function reads
  realty-agent-provision actor_type 'realty_agent_provision' 0 rows ever
  realty-agent-provision actor_type 'finalize_join'          0 rows ever
This is the same defect I introduced and fixed in the realty_agreement_versions trigger on
6 September. It is not a coincidence, it is a shape the project keeps producing: write to
audit_log, guess an actor_type, swallow the exception. Every one of those call sites
believes it is leaving a record and is not.

================================================================================
SLICE TWO ENDS HERE.
Read in slice two: 34, 35, 36, 37, 38, 39, 41, 42, 43, 47.
NOT yet read, resume with these three first:
  44 realty-agreement-url
  45 realty-blog
  46 realty-blog-public
then continue from 48 realty-doc onward.
Running total read: 50 of 104.
================================================================================
