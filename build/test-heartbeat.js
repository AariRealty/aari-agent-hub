// The cron estate monitor, checked offline.
//
// Same constraint as the parcel lookup: the build container's proxy blocks
// supabase.co, so this cannot run the real scan. It asserts the properties that
// go wrong in the source, and it exists because those properties are the whole
// product. A monitor that alerts twice is one she stops reading, and a monitor
// that cannot fail loudly is decoration.
//
// The live behaviour was proved separately against the real database on
// 5 September 2026 and is recorded in claude/heartbeat-built.md.
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const sql  = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260905_job_health_monitor.sql'), 'utf8');
const ts   = fs.readFileSync(path.join(ROOT, 'supabase/functions/realty-heartbeat/index.ts'), 'utf8');

const checks = [];
const ok = (name, pass, note) => checks.push([name, !!pass, note || '']);

// ---- Once per incident. The single most important property here. ----------
// The alert insert must sit behind a state-change test, never on the scan path,
// or an outage becomes one text per run until she mutes the sender.
ok('an alert is written only inside the edge branch',
   /if edge is not null then\s*\n\s*insert into realty_alerts/.test(sql));
ok('the edge is null unless the state changed',
   /elsif prev\.state <> p_state then/.test(sql));
ok('an unchanged state produces no edge',
   !/prev\.state = p_state[\s\S]{0,200}edge :=\s*'opened'/.test(sql));
ok('only the schema decides when to alert, not the caller',
   (ts.match(/from\('realty_alerts'\)/g) || []).length > 0
   && !/insert.*realty_alerts/i.test(ts));

// Both edges exist. She asked to know when it breaks and when it recovers,
// and nothing in between.
ok('an outage opens an incident',   /edge := 'opened'/.test(sql));
ok('a recovery closes it',          /edge := 'recovered'/.test(sql));
ok('only two edges are possible',   /check \(edge in \('opened','recovered'\)\)/.test(sql));

// ---- The recovery message must describe the outage, not the recovery ------
ok('a recovery reports the previous state', /msg_state := prev\.state/.test(sql));
ok('a recovery measures from when it broke', /msg_since := prev\.since/.test(sql));

// ---- What the message has to say, because she reads it on a phone --------
ok('the alert names the job',        /'Aari ALERT: ' \|\| p_job/.test(sql));
ok('the alert says how long',        /'Failing for ' \|\| approx \|\| dur/.test(sql));
ok('a stale job says how long since it ran', /'No run for ' \|\| approx \|\| dur/.test(sql));
ok('the alert carries the error',    /left\(regexp_replace\(p_error/.test(sql));
ok('an unbounded duration says "at least"', /approx text := case when p_lower then 'at least '/.test(sql));
ok('the error is truncated so one alert stays short', /, 160\)/.test(sql));

// ---- Onset must not reset on every scan ----------------------------------
ok('an ongoing state keeps its original onset', /began := least\(prev\.since, p_since\)/.test(sql));

// ---- The three states, and how staleness is decided ----------------------
['ok','failing','stale','unknown'].forEach((s) =>
  ok("state '" + s + "' exists", new RegExp("'" + s + "'").test(sql)));
ok('staleness comes from the observed cadence, not a parsed cron string',
   /percentile_cont\(0\.5\) within group \(order by gap\)/.test(sql));
ok('staleness needs three missed periods', /r\.period \* 3/.test(sql));
ok('with a floor so a five minute job does not flap',
   /greatest\(r\.period \* 3, interval '90 minutes'\)/.test(sql));

// ---- Performance. The first version did not finish inside 60 seconds. ----
ok('the scan reads cron history in single passes',
   /with last_ok as \(/.test(sql) && /cadence as \(/.test(sql) && /lasterr as \(/.test(sql));
ok('no correlated max() left inside a FILTER',
   !/filter \(where[\s\S]{0,120}\(select max\(/.test(sql));

// ---- The dead man's switch -----------------------------------------------
ok('the dead man switch exists', /function public\.heartbeat_deadman\(/.test(sql));
// Detection and delivery are deliberately separate functions. heartbeat_deadman
// must contain no network call at all, so it cannot be taken down by the thing
// it watches; heartbeat_deadman_run is the wrapper that then tries to deliver.
const deadmanBody = (sql.match(/function public\.heartbeat_deadman\(p_max[\s\S]*?\$hd\$;/) || [''])[0];
ok('the dead man switch body was found', deadmanBody.length > 0);
ok('its detection makes no network call',
   deadmanBody.length > 0 && !/call_edge_function|net\.http/.test(deadmanBody));
ok('delivery is a separate wrapper',
   /function public\.heartbeat_deadman_run\(/.test(sql)
   && /perform public\.call_edge_function\('realty-heartbeat'/.test(sql));
ok('it defaults to three hours', /p_max interval default interval '3 hours'/.test(sql));
ok('it says what it means when it fires',
   /Nothing is being monitored/.test(sql));
ok('a heartbeat that never reported is caught too',
   /has never reported/.test(sql));
ok('the monitor does not grade its own cron jobs',
   /not in \('aari-job-heartbeat','aari-heartbeat-deadman'\)/.test(sql));

// ---- Schedules ------------------------------------------------------------
ok('the heartbeat is scheduled hourly',  /cron\.schedule\('aari-job-heartbeat', '40 \* \* \* \*'/.test(sql));
ok('the dead man switch is scheduled hourly', /cron\.schedule\('aari-heartbeat-deadman', '50 \* \* \* \*'/.test(sql));
ok('they do not run in the same minute',
   /'40 \* \* \* \*'/.test(sql) && /'50 \* \* \* \*'/.test(sql));

// ---- Delivery is tracked apart from the alert existing -------------------
// A dead channel must never look like an alert that was never raised.
ok('delivery is its own column',        /delivered      boolean not null default false/.test(sql));
ok('a delivery failure keeps its reason', /delivery_error text/.test(sql));
ok('attempts are counted',              /attempts       integer not null default 0/.test(sql));
// The retry limit must be time, not tries. A count-based cap plus hourly
// retries gave up after five hours; Quo was down for 82 days.
ok('retrying is bounded by time, not attempt count', /const RETRY_FOR_DAYS = \d+/.test(ts));
ok('and no attempt-count cap has crept back', !/MAX_ATTEMPTS/.test(ts));
ok('the channel itself is a watched thing', /p_job: 'alert-channel-' \+ channel/.test(ts));
ok('an undeliverable alert is not marked delivered',
   /delivered: r\.ok/.test(ts) && /delivery_error: r\.ok \? null/.test(ts));

// ---- A terminal failure is not retried --------------------------------------
// A 402 is Payment Required. It will be refused identically every hour until a
// bill is paid, so retrying it 168 times buries the one line that matters.
ok('terminal HTTP statuses are named', /const TERMINAL_HTTP = \[401, 402, 403\]/.test(ts));
ok('402 Payment Required is terminal', /402/.test((ts.match(/const TERMINAL_HTTP = \[[^\]]*\]/) || [''])[0]));
ok('429 rate limit is NOT terminal, because it clears',
   !/429/.test((ts.match(/const TERMINAL_HTTP = \[[^\]]*\]/) || [''])[0]));
ok('a blocked alert is excluded from the retry set',
   /\.eq\('delivery_blocked', false\)/.test(ts));
ok('a terminal failure blocks the alert', /delivery_blocked: terminal/.test(ts));
ok('a blocked alert is still undelivered, not silently closed',
   /delivered: r\.ok/.test(ts) && !/delivered: true/.test(ts));
ok('the channel row says it is a billing question, not an outage',
   /billing question, not an outage/.test(ts));

// ---- Channel ---------------------------------------------------------------
ok('SMS is the shipped channel',        /const CHANNELS[^\n]*sms: sendSms/.test(ts));
ok('email is a seam, not a rewrite',    /email: sendEmail/.test(ts));
ok('email is not silently enabled',     /email channel not configured/.test(ts));
ok('SMS goes through Quo',              /api\.openphone\.com\/v1\/messages/.test(ts));
ok('every send is written to the one sms_log', /from\('sms_log'\)\.insert/.test(ts));
ok('a flood becomes one summary, not many texts', /const BATCH_ABOVE = \d+/.test(ts));

// ---- Order of operations ---------------------------------------------------
ok('the heartbeat marks itself alive only after the work',
   ts.indexOf("p_job: PARCEL_PROBE") < ts.indexOf("p_job: 'aari-heartbeat'"));
ok('the parcel probe reports through the same ledger',
   /p_job: PARCEL_PROBE, p_kind: 'probe'/.test(ts));
ok('a probe that does not answer is a failure, not a silence',
   /probe did not answer/.test(ts));

// ---- Access ---------------------------------------------------------------
ok('both tables have RLS on',
   /alter table realty_job_health enable row level security/.test(sql)
   && /alter table realty_alerts     enable row level security/.test(sql));
ok('the health functions are not callable by anon',
   /revoke all on function public\.cron_health_scan\(\) from public, anon, authenticated/.test(sql));
ok('the heartbeat is service role only', /function isServiceRole/.test(ts));
ok('it checks the role claim, not a key string', /claims\?\.role === 'service_role'/.test(ts));

// ---- House style -----------------------------------------------------------
const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
const dashes = [...sql, ...ts].filter((c) => c === EM || c === EN).length;
ok('no em or en dashes', dashes === 0, dashes + ' found');

checks.forEach(([n, pass, note]) => console.log((pass ? 'ok   ' : 'FAIL ') + n + (pass || !note ? '' : '  (' + note + ')')));
const failed = checks.filter((c) => !c[1]).length;
console.log('\n' + checks.length + ' checks, ' + failed + ' failed');
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
