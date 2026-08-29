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

### 1. `mode: "headers"` — writes nothing

Returns every column heading in the export and shows where each field
resolved. Run this first on any new export.

Read two lines of the response:

- `missing` — fields with no matching column. **These are the ones the Hub
  cannot fill.**
- `fell_back` — fields matched by position, not by name. Check each one is
  pointing at the column you expect.

### 2. `mode: "dry_run"` — parses every row, writes nothing

Returns a preview per file: agent, address, status, price, gross, net,
client, effective date, contract type and the company fee it would write.
Read a few rows before committing.

### 3. `mode: "commit"` — writes

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

## Two behaviour changes from the deployed version

**1. Columns are found by heading, not by position.** The deployed version uses
fixed indices, including column 232. The day SkySlope inserts a column, every
field after it shifts by one and the import writes plausible values into the
wrong fields, silently. `test-headers.js` covers exactly that case.

**2. `company_fee` is a flat fee, not the whole commission.** Every earlier
version wrote `company_fee = gross_commission`, which sets the brokerage fee
equal to the entire commission on the file and makes every revenue figure
derived from it wrong. This writes Exhibit A: **$499 residential, $299 vacant
land**. This is a change to money and it is deliberate; if Exhibit A has moved
on, say so before this is deployed.

---

## Priority when not everything maps

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
