# masterdata-import — pending change, NOT deployed

`index.ts.pending` extends the live function (v4) with:

- `external_id` read from the SkySlope Transaction Id (column 232, falling back
  to Listing Id). Matching on it means a re-import updates the file instead of
  creating a second copy under a slightly different address string. The live
  version matches on `(agent_id, property_address)` only.
- `import_source`, `import_batch` and `review_state` stamped on write.
  **Currently handled by the `realty_tx_enter_review` trigger instead**, so the
  queue already works without this deploy.
- An agent who has already answered keeps their answer when the same file is
  re-imported.
- `create_missing_agents`, default **false**. The live version silently creates
  a real auth user and a `realty_members` row for any agent name it cannot
  match — a typo in the spreadsheet mints a person. This makes it opt-in.
- `dry_run`, returning the parsed preview without writing.
- `land_sale` tx_type when the property type mentions land, lot or vacant,
  which is what drives the $299 fee under Exhibit A.

Not deployed because it could not be exercised end to end from here — it needs
a real broker JWT and a real upload. Deploy it alongside a live test.

Also unresolved in the live version: it writes `company_fee: d.gross`, setting
the company fee equal to the whole gross commission. Exhibit A says the fee is
a flat $499 residential / $299 vacant land. Left alone rather than changed
without asking.
