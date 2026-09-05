# masterdata-import

Bulk loads SkySlope transactions into `realty_transactions`. A version of this
is already deployed (v4). What is in this folder is **not deployed**, which is
what `.pending` means.

---

## What to export from SkySlope

**The report:** MasterData export, the same one that produced the current
56 rows. XLSX, all transactions, no date filter. It is the widest export
SkySlope offers, roughly 230 columns.

**Do not hand-pick columns.** Export everything. The importer finds what it
needs by column heading, and extra columns cost nothing.

**Layout it expects:** three banner rows, headings on row 4, data from row 6.
That is SkySlope's own layout; do not tidy it.

---

## Run it in three steps, in this order

### 1. `mode: "headers"`, which writes nothing

Returns every column heading in the export and shows where each field
resolved. Run this first on any new export.

Read two lines of the response:

- `missing`, fields with no matching column. **These are the ones the Hub
  cannot fill.**
- `fell_back`, fields matched by position rather than by name. Check each one is
  pointing at the column you expect.

### 2. `mode: "dry_run"`, which parses every row and writes nothing

Returns a preview per file: agent, address, status, price, gross, net,
client, effective date, contract type and the company fee it would write.
Read a few rows before committing.

### 3. `mode: "commit"`, which writes

Matches on SkySlope's own Transaction Id, so re-running updates files rather
than creating second copies under slightly different address strings.

---

## What maps to what

Resolved by heading, case and punctuation insensitive. The first alias that
matches wins.

| Column in `realty_transactions` | Headings it accepts |
| --- | --- |
| `status` | Transaction Status, Status |
| `tx_type` | Transaction Type, Type (plus Property Type, to spot land) |
| `property_address` | Property Address, Street Address, Full Address |
| `price` | Sale Price, Purchase Price, Contract Price, then List Price |
| `closing_date` | Actual Closing Date for paid files, Scheduled Closing Date otherwise |
| `gross_commission` | Gross Commission, Total Commission, GCI |
| agent, to match `agent_id` | Agent First Name + Agent Last Name |
| `external_id` | Transaction Id, then Listing Id |
| **`net_commission`** | **Net Commission, Agent Net, Net To Agent, Agent Commission** |
| **`client_name`** | **Client Name, Buyer Name, Seller Name, Clients** |
| **`effective_date`** | **Effective Date, Contract Effective Date, Acceptance Date, Contract Date, Binding Agreement Date** |
| **`contract_type`** | **Contract Type, Form Type, Agreement Type** |

The four in bold are the ones currently empty in the database and the reason
Transactions and the deadline engine cannot run. If `mode: "headers"` reports
any of them as missing, tell me the exact heading SkySlope uses and I will add
it to the alias list. **I will not guess a column.**

---

## status and lifecycle are two different questions

`status` is where a file sits in the brokerage's pipeline: `draft`,
`submitted`, `paid`. `lifecycle` is what happened to the deal: `Active`,
`Closed`, `Terminated`. **Neither is derivable from the other.** The one
Terminated file in the book carries `status = 'draft'`, so the split cannot
be read off `status`.

`lifecycle` is a plain nullable text column. No default, no trigger, no
generation expression. All 56 rows carry a value only because it was filled
in by hand once, and nothing has touched those rows since 1 August.

Every earlier version of this importer wrote `status` and never `lifecycle`.
An imported file would have landed with `lifecycle` null, matched none of the
three Deals filters, and disappeared from the screen with no error. It writes
both now:

| SkySlope status | `status` | `lifecycle` |
| --- | --- | --- |
| Closed | `paid` | `Closed` |
| Pending | `submitted` | `Active` |
| Active | `draft` | `Active` |
| Canceled, Terminated, Withdrawn, Expired | `draft` | `Terminated` |
| anything else | dropped, and counted in `dropped_by_status` |

**Terminated files are no longer discarded.** The previous version dropped
anything starting "canceled" outright, so a cancelled deal could never arrive
through an import. A cancelled deal is part of the record.

Any status the classifier does not recognise is returned in
`dropped_by_status` with a count, so a file cannot vanish between the export
and the book without it showing in the response.

## Two behaviour changes from the deployed version

**1. Columns are found by heading, not by position.** The deployed version uses
fixed indices, including column 232. The day SkySlope inserts a column, every
field after it shifts by one and the import writes plausible values into the
wrong fields, silently. `test-headers.js` covers exactly that case.

**2. `company_fee` is no longer written at all.**

The deployed version writes `company_fee = gross_commission`, setting the
brokerage fee to the entire commission on the file. That is wrong, and it is
latent rather than realised: 15 of the 80 rows carry a `company_fee` today and
**none** of them equals `gross_commission`, so no file has been damaged yet.
Running the deployed version again is what would do it.

**Correction, 5 September 2026.** An earlier draft of this file said the fee
depends on the agent's commission plan and listed Growth as $299 residential
and $499 vacant land, with three plans unconfirmed. That was wrong, and it was
wrong in the direction that kept this importer from shipping.

Exhibit A of the signed ICA v6, the Commission Fee Schedule, read out of
`agreements/Aari-Realty-ICA-v6.pdf`:

| Plan | Split | Txn fee residential | Txn fee vacant land |
| --- | --- | --- | --- |
| Mentorship Path | 75% / 25% | $499 | $299 |
| Growth | 85% / 15% | $499 | $299 |
| Max | 100% | $499 | $299 |

**Flat $499 residential and $299 vacant land on every plan.** The fee does not
vary by plan at all, which is what the Hub has said all along next to
`var TXFEE=499, TXFEE_LAND=299`. The signed agreement is the system of record
and it agrees with the Hub, not with this file.

So `FEE_BY_PLAN` does not need a matrix. It needs the property type and two
numbers. What is genuinely still open is narrower: Exhibit A names only the
three current plans, so the four members on the two retired plans, `80_20` and
`70_30`, have no fee written into any agreement. Those are the only rows that
should land with a null fee and a count in `fee_not_set`.

## Priority when not everything maps## Priority when not everything maps

Marlenyi's order, 29 August:

**52 closed files** need `net_commission`, closing date, `client_name`, side,
address, price. That is production history and GCI. They do not need
`effective_date`; those deadlines are past.

**4 active and terminated files** need the full set including
`effective_date` and `contract_type`. These are the only files the deadline
engine ever runs on.

---

## Still open

- **Not deployed.** It cannot be exercised end to end from the build
  container: it needs a real broker JWT and a real upload. Deploy alongside a
  live `mode: "headers"` run.
- `create_missing_agents` defaults to **false**. The deployed version silently
  creates an auth user and a `realty_members` row for any agent name it cannot
  match, so a typo in the spreadsheet mints a person.
- `realty_tx_deadlines` is empty and nothing writes to it yet. Effective dates
  landing in `realty_transactions` is the prerequisite, not the whole job.
