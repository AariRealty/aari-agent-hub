# Credential exposure record

**Prepared 7 September 2026 for Aari Realty LLC.** Written to be read by someone who has
not seen this software. Technical terms are explained where they are unavoidable.

---

## 1. What happened, in one paragraph

Aari Realty's software is kept in ten "repositories" on GitHub, a public code hosting
service. A repository can be public, meaning anyone on the internet can read it, or
private. Seven of the ten were public. Passwords and access keys that should only ever
have existed on Aari's servers were written directly into the code in those repositories,
where they could be read by anyone. The most serious of them unlocks a report containing
every closed real estate deal the company has done, including what each agent was paid.

---

## 2. Terms used below

- **Repository.** A folder of code with a complete history of every change ever made.
- **Public repository.** Readable by anyone on the internet, without an account.
- **Commit.** One recorded change. History keeps every version, so removing a password from
  today's copy does not remove it from the history.
- **Code search.** GitHub indexes public repositories and lets anyone search across them.
  Automated tools scan public GitHub continuously looking for exactly this kind of key.
- **Token / key / secret.** A long string that acts as a password for a computer system.

---

## 3. What each exposed credential unlocks, in business terms

| # | Credential | What holding it lets someone do |
|---|---|---|
| 1 | SkySlope Books sync token | Retrieve every closed deal for the company: property, closing date, gross commission, the company's net, and **the amount paid to each named agent**. |
| 2 | Agent provisioning token | Create a working Aari Realty agent account, including the login, and have the system treat that person as an active member of the brokerage with a commission plan. |
| 3 | Manual provisioning key | Bypass the control that stops the cheapest commission plan being self-selected. |
| 4 | Broadcast token | Send an email with any content whatsoever, to any list of addresses, appearing to come from the broker at an Aari Realty address. |
| 5 | Unsubscribe secret | Generate any person's unsubscribe link, and so remove them from mailings or confirm they are on the list. |
| 6 | Storage read token | Read any stored file in the company's file storage, which includes executed agreements. |
| 7 | Hub injection key | Add or remove code in the web page every Aari agent loads when they log in. |
| 8 | Email import secret | Create transaction files, attach documents to existing files, and archive existing files. |
| 9 | Email flag secret | Add flags to any transaction file. |
| 10 | Diagnostic phrase | Read the structure of the agent Hub page. |
| 11 | Mail domain listing token | List which sending domains the company has verified. |
| 12 | Web signing token | Submit a request that builds and records an executed Independent Contractor Agreement through the public join flow. |
| 13 | Mapbox mapping token | Use the company's paid mapping account. A billing exposure rather than a data one. |

Numbers 1 to 11 were identified between 5 and 7 September. Numbers 12 and 13 were found by
the systematic scan on 7 September described in section 6.

---

## 4. The exposure window

"First seen" and "last seen" are the dates of the earliest and latest recorded change that
contained the value. **All seven repositories named here are public as of 7 September 2026.**
Their visibility on earlier dates cannot be established from the repository itself; GitHub
records visibility changes in an audit log available to the account owner, and that log is
where an authoritative history of visibility would come from.

| Credential | Repository | First seen | Last seen | Still in today's copy |
|---|---|---|---|---|
| SkySlope Books token | aari-agent-hub | 30 Jul 2026 | 7 Sep 2026 | No, removed 7 Sep |
| SkySlope Books token | Recruiting2 | 25 Aug 2026 | 25 Aug 2026 | **Yes** |
| SkySlope Books token | aari-financial-hub (private) | not established, shallow copy | | **Yes** |
| Agent provisioning token | Recruiting2 | 10 Jul 2026 | 27 Jul 2026 | **Yes** |
| Email import secret | aari-transactions-landing | 11 Aug 2026 | 14 Aug 2026 | **Yes** |
| Web signing token | Recruiting2 | 10 Jul 2026 | 7 Sep 2026 | **Yes** |
| Mapbox token | aari-transactions-landing | 4 Jun 2026 | 5 Sep 2026 | **Yes** |
| The eleven listed in section 5 | aari-agent-hub | 7 Sep 2026 | 7 Sep 2026 | No, redacted 7 Sep |

The SkySlope Books token was in the public `aari-agent-hub` repository for **thirty nine
days**, across 154 recorded changes and more than 120 named lines of development.

---

## 5. Part of this exposure was caused by the security review itself

On 7 September 2026, while cataloguing these problems, the reviewing assistant wrote a
findings document that quoted eleven of the credentials in full, and published it to the
public `aari-agent-hub` repository in two changes. Those credentials had previously existed
only inside server code that is not published. Publishing the findings document made them
publicly readable for the first time.

They were redacted the same day, within approximately one hour. Redaction removes them from
today's copy and not from the history.

This is recorded because a record that omits how part of the exposure occurred is not a
record.

---

## 6. What was searched, and what was not found

On 7 September 2026 all ten repositories were scanned for credential patterns, not merely
for the ones already known. The seven public repositories were scanned across their
**complete history, every branch and every version ever committed**. The three private
repositories were scanned in **today's copy only**, because only a shallow copy of each was
available; their histories have not been examined.

**Not found anywhere, in any repository:** a Supabase service role key (the master database
key), any Stripe payment key, any email provider API key, any Twilio messaging credential,
any Amazon Web Services key, any GitHub access token, any private cryptographic key, and any
database connection string containing a password.

That is a materially important negative finding. The master database key, which would grant
unrestricted access to all company records, was **not** exposed.

Four Supabase "anon" keys were found in the public repositories. These are designed to be
public and are not a finding in themselves. They do reveal that four separate Supabase
projects exist, three of which have not been reviewed.

---

## 7. What is known, and what is not

**Known:** these values were readable by anyone on the internet during the windows above.

**Not known:** whether anyone actually read or used any of them. Exposure and access are
different facts, and only the first has been established.

Nothing in this document should be read as evidence that a credential was used. Nothing in
it should be read as evidence that none was.

---

## 8. Whether use of the SkySlope Books token can be detected

Partly, and better than expected.

**On Aari's side.** The service that the token unlocks records every request it receives.
Those records exist continuously from at least 30 July 2026, which covers the entire
exposure window. Spot checks on 30 July, 20 August, 1 September, 5 and 6 September found
no requests other than those made by the reviewer on 7 September during this work. A
complete day by day enumeration of the whole window is possible and has not yet been run in
full; it would produce a definitive list of every request and the network address it came
from.

**On SkySlope's side.** SkySlope Books is a third party. Whether it keeps its own access
logs, and whether Aari can obtain them, is a question for SkySlope. If a determination of
actual access is required, that request should be made to SkySlope promptly, because third
party log retention is often short.

**What cannot be determined from either.** If someone copied the repository and read the
value without ever using it, nothing anywhere would record that.

---

## 9. Remediation, with dates

| Date | Action | Status |
|---|---|---|
| 7 Sep 2026 | SkySlope Books token removed from the code and moved to a server side secret; the service now refuses to run at all if the secret is unset | Done |
| 7 Sep 2026 | Three functions disabled: broadcast, agent provisioning, invoice preview | Done |
| 7 Sep 2026 | Eleven credentials redacted from the findings document | Done |
| 7 Sep 2026 | All ten repositories scanned for further credentials | Done |
| Pending | **Issue a new SkySlope Books token and revoke the old one** | **Broker action. Not done.** |
| Pending | Rotate the other twelve credentials listed in section 3 | **Broker action. Not done.** |
| Pending | Make the seven public repositories private | **Broker action. Not done.** |
| Pending | Remove the credentials still present in today's copies (section 4) | Not done |
| Pending | Examine the history of the three private repositories | Not done |

Rotation is the only remedy that works. Removing a value from the code, and even making a
repository private, does nothing about copies already taken.

---

## 10. The three private repositories

`aari-financial-hub`, `aari-realty-crm` and `aari-catherine-hub` are private as of
7 September 2026. Their contents were not publicly readable.

They are named here so the record shows what was and was not exposed. One of them,
`aari-financial-hub`, does contain the SkySlope Books token in today's copy. It was not
publicly exposed there, but it is one visibility setting away from being so, and it is a
further reason the token must be rotated rather than merely deleted.
