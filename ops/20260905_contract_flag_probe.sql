-- Applied 5 September 2026. The record of what was run, not a plan.
--
-- Two secrets, both for functions that are gated on them out of realty_config.
-- That table has RLS on and no policies, so only the service role can read it,
-- which is the same shape as the other job secrets already in there.
--
--   contract_probe_secret · realty-contract-probe, which reads contracts and
--     returns numbers and booleans only. No names, no addresses, no snippets.
--     It exists so a candidate flag can be measured against real files before
--     it becomes a rule, and it writes nothing, ever.
--
-- What the probe found across ten real contracts, which is why two of the four
-- flags planned from the RealtyOps comparison were not built:
--
--   Inspection period against the form default of 15 days. Dropped. The FR/BAR
--   carries numbered lines down the margin and the text layer places those
--   numbers beside the phrase. All three AS IS contracts returned 263, 264,
--   265, 266, 267 near "Inspection Period". Those are line numbers.
--
--   Loan approval period. Dropped for the same reason, and more clearly: 59,
--   7, 60, 61, 100, 101 and so on, identical across all three contracts,
--   because it is the blank form being read rather than the filled value.
--
-- What it found instead, and what was built:
--   1 of 10 contracts has no text layer at all. A scan. The extractor returns
--     nothing on it and nothing said why.
--   10 of the 20 files examined carry no contract path at all.
--   3 of 10 packets carry more than one Florida zip.
--   1 of 10 references a certificate of occupancy.
--   Only 3 of 10 are FR/BAR AS IS contracts. The rest are listing agreements,
--     one page documents and lender letters, which is worth knowing before
--     anybody writes another contract rule.

insert into realty_config (key, value) values
  ('contract_probe_secret', '<<set out of band, see the deployed function>>')
on conflict (key) do nothing;
