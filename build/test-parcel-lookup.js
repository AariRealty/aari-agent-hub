// The county lookup, checked offline.
//
// WHY THIS CANNOT BE THE LIVE SMOKE TEST. The build container's egress proxy
// blocks the general internet and supabase.co both, so `npm run check` cannot
// reach an ArcGIS layer or the deployed function. A live probe here would have
// to be skipped or faked, and a check that quietly skips is worse than no check.
//
// So the live smoke lives in the function itself, as `{"smoke": true}`, and is
// run from inside Supabase's network. What this file does instead is assert the
// things that go wrong in the source rather than on the wire, which is where
// both of the real failures came from:
//
//   the wrong county code sitting in the config, and
//   a probe too weak to notice it.
//
// Run the live one with:
//   select net.http_post(
//     url := '.../functions/v1/realty-parcel-lookup',
//     headers := jsonb_build_object('Content-Type','application/json',
//       'Authorization','Bearer <anon jwt>'),
//     body := '{"smoke":true}'::jsonb, timeout_milliseconds := 180000);
const fs   = require('fs');
const path = require('path');
const SRC  = path.join(__dirname, '..', 'supabase', 'functions', 'realty-parcel-lookup', 'index.ts');

const src = fs.readFileSync(SRC, 'utf8');
const checks = [];
const ok = (name, pass, note) => checks.push([name, !!pass, note || '']);

// The four county codes, confirmed on 5 September 2026 by listing the distinct
// cities under each. These are the numbers that were got wrong twice, so they
// are written out here rather than read from the file they are meant to guard.
const EXPECTED = {
  charlotte: { coNo: 18, parcel: '412212126001',              fullLegal: false },
  collier:   { coNo: 21, parcel: '14044720002',               fullLegal: false },
  hendry:    { coNo: 36, parcel: '3 34 43 01 010 0362-012.0', fullLegal: false },
  lee:       { coNo: null, parcel: '244423C2011980020',       fullLegal: true  },
};

// Pull each county block out of the COUNTIES literal.
function block(key) {
  const m = src.match(new RegExp('\\n  ' + key + ': \\{([\\s\\S]*?)\\n  \\},'));
  return m ? m[1] : null;
}

Object.keys(EXPECTED).forEach((key) => {
  const b = block(key);
  ok('county ' + key + ' is configured', !!b);
  if (!b) return;
  const want = EXPECTED[key];

  const coNo = (b.match(/coNo:\s*(\d+)/) || [])[1];
  if (want.coNo === null) {
    ok(key + ' carries no county code (its own layer, not FDOR)', coNo === undefined);
  } else {
    ok(key + ' county code is ' + want.coNo, Number(coNo) === want.coNo, 'found ' + coNo);
  }

  const parcel = (b.match(/probeParcelId:\s*'([^']*)'/) || [])[1];
  ok(key + ' probe asserts a parcel id', parcel === want.parcel, 'found ' + parcel);

  ok(key + ' probe names a public address', /probeAddress:\s*'[^']*\d[^']*'/.test(b));
  ok(key + ' probe has a where clause', /probeWhere:\s*"[^"]+"/.test(b));

  const full = /fullLegal:\s*true/.test(b);
  ok(key + ' full legal flag is ' + want.fullLegal, full === want.fullLegal);
});

// 32 is Glades. It must not appear as a county code anywhere in this file: that
// was the wrong Hendry, and LaBelle sits under both 32 and 36 so a city probe
// could not tell them apart.
ok('Glades (32) is not configured as a county', !/coNo:\s*32\b/.test(src));

// Every parcel id in the config is distinct. Two counties sharing one would mean
// a copy-paste, and the smoke test would then pass on a repointed layer.
const ids = (src.match(/probeParcelId:\s*'([^']*)'/g) || []).map((s) => s.split("'")[1]);
ok('four probe parcel ids', ids.length === 4, 'found ' + ids.length);
ok('probe parcel ids are all distinct', new Set(ids).size === ids.length);

// The smoke test must assert the parcel id. Asserting the city is what let the
// wrong county through, so a regression to a city assertion has to fail here.
const smoke = (src.match(/async function smoke\(\)[\s\S]*?\n}\n/) || [''])[0];
ok('smoke compares the parcel id', /idOk\s*=\s*p\.parcel_id === c\.probeParcelId/.test(smoke));
ok('smoke still checks the county code', /countyOk/.test(smoke) && /Number\(p\.co_no\) === c\.coNo/.test(smoke));
ok('smoke requires the probe to stay unique', /probe_no_longer_unique/.test(smoke));
ok('smoke fails loudly on an empty probe', /known_address_returned_nothing/.test(smoke));
ok('smoke rolls up to a single ok', /ok: out\.every\(\(x\) => x\.pass\)/.test(smoke));

// Paragraph 1(c). Outside Lee the legal is a stub and must never be offered for
// a contract, and the wording has to point the agent somewhere, not just say the
// field is empty.
ok('short form legal is withheld from 1(c)', /legal_description: shortForm \? null/.test(src));
ok('legal_for_contract is false for a short form', /legal_for_contract: !shortForm/.test(src));
ok('the 1(c) note says short form, not unavailable',
   /publishes a short form legal description/.test(src) && !/legal[^\n]*unavailable/i.test(src));
ok('the 1(c) note names the deed and the title commitment',
   /from the deed or the title commitment/.test(src));

// The owner name is a year old at worst and must never render bare.
ok('the owner note carries the roll year', /Owner of record per the ' \+ row\.roll_year/.test(src));
ok('the owner note warns about a later sale', /will not appear here/.test(src));

// Every outcome is named, and the table's check constraint holds the same list.
['found','not_found','ambiguous','county_unsupported','timeout','blocked','error']
  .forEach((o) => ok("outcome '" + o + "' is produced", src.includes("'" + o + "'")));

// A failure must never present as an absence.
ok('a timeout says the lookup failed', /did not answer in time[\s\S]*?not because the property has no record/.test(src));
ok('a refusal says the lookup was refused', /refused the request[\s\S]*?not because the property has no record/.test(src));
ok('a wrong county result is discarded, not shown', /answered with a parcel in a different county and the result was discarded/.test(src));
ok('the county guard runs on real lookups too', /const strays = feats\.map/.test(src));

// Duplicate geometries, and the row cap.
ok('duplicate parcels are collapsed', /function dedupe\(/.test(src));
ok('dedupe runs before the ambiguity decision', src.indexOf('const feats = dedupe(rawFeats') < src.indexOf('if (feats.length > 1)'));
ok('the row cap is a named constant', /const ROW_CAP = \d+/.test(src));
ok('a capped list is reported as a floor', /truncated \? feats\.length \+ ' or more'/.test(src));
ok('a capped list says so', /candidates_truncated: truncated/.test(src));

// The relaxed retry, which is the only reason Hendry answers at all.
ok('a miss is retried with looser spacing', /function relaxedPattern\(/.test(src));
ok('the street number stays anchored in the relaxed pattern', /parts\[0\] \+ ' %'/.test(src));
ok('a relaxed match is labelled', /match_mode: matchMode/.test(src) && /match_note/.test(src));
ok('a relaxed match is never called exact', /matchMode = 'relaxed'/.test(src));

// Cached and fresh answers have to be the same shape, or a cache hit becomes a
// second version of the truth.
ok('one shape function serves cache and layer', (src.match(/return shape\(/g) || []).length >= 1
   && /\.\.\.shape\(hit as Record<string, unknown>, c\), from_cache: true/.test(src));
ok('a cache hit is marked as one', /from_cache: true/.test(src));
ok('the cache key escapes LIKE wildcards', /replace\(\/\[%_\\\\\]\/g/.test(src));

// Nothing is ever presented as authoritative.
ok('every found result carries its source', /source: row\.source, source_url: row\.source_url/.test(src));
ok('every found result carries when it was read', /fetched_at: row\.fetched_at/.test(src));
ok('nothing is marked authoritative', /authoritative: false/.test(src) && !/authoritative: true/.test(src));
ok('the agent can always overwrite', /editable: true/.test(src));

// House style.
// Written by codepoint so this file does not contain the characters it bans.
const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
const dashes = [...src].filter((ch) => ch === EM || ch === EN).length;
ok('no em or en dashes', dashes === 0, dashes + ' found');

checks.forEach(([n, pass, note]) => console.log((pass ? 'ok   ' : 'FAIL ') + n + (pass || !note ? '' : '  (' + note + ')')));
const failed = checks.filter((c) => !c[1]).length;
console.log('\n' + checks.length + ' checks, ' + failed + ' failed');
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
