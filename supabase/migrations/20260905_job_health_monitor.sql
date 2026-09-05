-- Cron estate monitoring.
--
-- WHY. On 5 September 2026 this project had 23 active cron jobs and nothing
-- watching any of them. purge-closed-tc-documents had failed 22 of its last 23
-- runs, every day since 14 August, and nobody knew, because a failed cron
-- writes to cron.job_run_details and nothing reads it. That is the same shape
-- as a lookup that returns nothing: an absence standing in for a failure.
--
-- WHAT IT WATCHES. Three states, from two sources.
--
--   failing  a run returned an error since the last success
--   stale    the job has not run when its own history says it should have
--   ok       neither
--
-- Staleness is derived from the job's observed cadence rather than by parsing
-- its cron expression. A job that has run every five minutes for a month tells
-- you its own period more reliably than a schedule string does, and it keeps
-- working for every schedule format without a parser to get wrong.
--
-- WHAT IT CANNOT SEE. A job whose command is a net.http_post reports success
-- when the post succeeds, whatever the edge function then returns. Checked on
-- live data: payment_reminder_hourly and ics-sync-hourly both record
-- "succeeded" with return_message "1 row" because posting worked. So an edge
-- function that 500s forever looks healthy here. That gap is real and is named
-- in the write-up rather than papered over. The parcel smoke is covered because
-- it reports its own verdict into this same ledger.

-- One row per watched thing, holding its current state. Not a log: the log is
-- realty_alerts. This is "what is true now".
create table if not exists realty_job_health (
  job_name             text primary key,
  kind                 text not null check (kind in ('cron','probe')),
  state                text not null check (state in ('ok','failing','stale','unknown')),
  -- When the current state began. Once the monitor is running this is exact.
  -- On the first scan it is bounded by whatever cron history is still retained,
  -- which is why the alert says "at least" when it is working from that.
  since                timestamptz not null default now(),
  since_is_lower_bound boolean not null default false,
  last_run_at          timestamptz,
  last_ok_at           timestamptz,
  consecutive_failures integer not null default 0,
  observed_period      interval,
  last_error           text,
  detail               jsonb,
  updated_at           timestamptz not null default now()
);

-- One row per incident edge, never per run. An alert that fires 48 times in an
-- outage is an alert that stops being read, so only two things are written:
-- the moment something breaks, and the moment it recovers.
create table if not exists realty_alerts (
  id             uuid primary key default gen_random_uuid(),
  job_name       text not null,
  edge           text not null check (edge in ('opened','recovered')),
  state          text not null,
  message        text not null,
  detail         jsonb,
  -- Delivery is tracked separately from the alert existing. A channel that is
  -- down must never look like an alert that was never raised.
  channel        text,
  delivered      boolean not null default false,
  delivery_error text,
  delivered_at   timestamptz,
  attempts       integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists realty_alerts_undelivered_idx
  on realty_alerts (created_at) where not delivered;
create index if not exists realty_alerts_job_idx
  on realty_alerts (job_name, created_at desc);

alter table realty_job_health enable row level security;
alter table realty_alerts     enable row level security;

-- Records a state for one watched thing and, only on a change, writes the
-- incident edge. Every caller goes through here so "once per incident" is a
-- property of the schema and not of whoever remembered to check.
create or replace function public.record_job_health(
  p_job     text,
  p_kind    text,
  p_state   text,
  p_since   timestamptz default now(),
  p_lower   boolean default false,
  p_last_run timestamptz default null,
  p_last_ok  timestamptz default null,
  p_fails    integer default 0,
  p_period   interval default null,
  p_error    text default null,
  p_detail   jsonb default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $rjh$
declare
  prev  realty_job_health%rowtype;
  edge  text := null;
  began timestamptz := p_since;
  -- What the alert should describe. On an outage that is the outage now
  -- starting; on a recovery it is the outage that just ended. Getting this
  -- wrong produced "Recovered after 0 min ok", which tells her nothing.
  msg_since timestamptz;
  msg_state text;
  msg_lower boolean;
  msg_fails integer;
begin
  select * into prev from realty_job_health where job_name = p_job;

  -- Hold the original onset across repeated scans of the same ongoing state,
  -- so "failing for 21 days" stays 21 days instead of resetting every hour.
  if found and prev.state = p_state then
    began := least(prev.since, p_since);
  end if;

  if not found then
    -- First sight. A thing discovered already broken is an incident: that is
    -- the purge, and not opening it would hide exactly what this exists for.
    edge := case when p_state in ('failing','stale') then 'opened' else null end;
  elsif prev.state <> p_state then
    if p_state in ('failing','stale') then edge := 'opened';
    elsif p_state = 'ok' and prev.state in ('failing','stale') then edge := 'recovered';
    end if;
  end if;

  if edge = 'recovered' then
    msg_since := prev.since;  msg_state := prev.state;
    msg_lower := prev.since_is_lower_bound; msg_fails := prev.consecutive_failures;
  else
    msg_since := began; msg_state := p_state;
    msg_lower := p_lower; msg_fails := p_fails;
  end if;

  insert into realty_job_health (job_name, kind, state, since, since_is_lower_bound,
      last_run_at, last_ok_at, consecutive_failures, observed_period, last_error, detail, updated_at)
  values (p_job, p_kind, p_state, began, p_lower, p_last_run, p_last_ok,
      p_fails, p_period, p_error, p_detail, now())
  on conflict (job_name) do update set
    kind = excluded.kind, state = excluded.state, since = excluded.since,
    since_is_lower_bound = excluded.since_is_lower_bound,
    last_run_at = excluded.last_run_at, last_ok_at = excluded.last_ok_at,
    consecutive_failures = excluded.consecutive_failures,
    observed_period = excluded.observed_period,
    last_error = excluded.last_error, detail = excluded.detail, updated_at = now();

  if edge is not null then
    insert into realty_alerts (job_name, edge, state, message, detail)
    values (p_job, edge, msg_state,
      public.format_alert(p_job, edge, msg_state, msg_since, msg_lower, msg_fails, p_error),
      p_detail);
  end if;

  return edge;
end;
$rjh$;

-- The message she reads on a phone. It has to say which job, what failed, and
-- how long it has been failing. "A cron job failed" is not an alert.
create or replace function public.format_alert(
  p_job text, p_edge text, p_state text,
  p_since timestamptz, p_lower boolean, p_fails integer, p_error text
) returns text
language plpgsql stable
as $fa$
declare
  secs   bigint := greatest(0, extract(epoch from (now() - p_since))::bigint);
  dur    text;
  approx text := case when p_lower then 'at least ' else '' end;
begin
  dur := case
    when secs < 5400        then (secs / 60)::text   || ' min'
    when secs < 172800      then (secs / 3600)::text || ' hours'
    else                         (secs / 86400)::text || ' days'
  end;

  if p_edge = 'recovered' then
    return 'Aari OK again: ' || p_job || E'\n'
        || 'Recovered after ' || approx || dur || ' ' || p_state || '.';
  end if;

  return 'Aari ALERT: ' || p_job || E'\n'
      || case p_state
           when 'failing' then 'Failing for ' || approx || dur
                               || coalesce(' (' || nullif(p_fails,0)::text || ' runs)', '') || '.'
           when 'stale'   then 'No run for ' || approx || dur || '. Expected sooner.'
           else p_state
         end
      || coalesce(E'\n' || left(regexp_replace(p_error, '\s+', ' ', 'g'), 160), '');
end;
$fa$;

-- The scan. Pure SQL over cron's own tables, no network, so it cannot be taken
-- down by the thing it is watching.
--
-- Written as single pass CTEs rather than correlated subqueries. The first
-- version put "(select max(start_time) where succeeded)" inside a FILTER, which
-- re-evaluates per row: 48,429 run rows across 23 jobs and it did not finish
-- inside 60 seconds. Each CTE below touches the table once.
create or replace function public.cron_health_scan()
returns table (job_name text, state text, edge text)
language plpgsql
security definer
set search_path = public, pg_temp
as $chs$
declare
  r record;
  v_state text;
  v_since timestamptz;
  v_lower boolean;
  v_edge  text;
begin
  for r in
    with last_ok as (
      select jobid, max(start_time) as last_ok
        from cron.job_run_details where status = 'succeeded' group by jobid
    ),
    agg as (
      select d.jobid,
             max(d.start_time) as last_run,
             min(d.start_time) as oldest_retained,
             count(*) filter (where d.status <> 'succeeded'
                              and d.start_time > coalesce(l.last_ok, '-infinity'::timestamptz)) as fails_since_ok,
             min(d.start_time) filter (where d.status <> 'succeeded'
                              and d.start_time > coalesce(l.last_ok, '-infinity'::timestamptz)) as first_fail
        from cron.job_run_details d
        left join last_ok l on l.jobid = d.jobid
       group by d.jobid
    ),
    -- The job's own cadence: median gap across its twelve most recent runs. A
    -- job that has run every five minutes for a month states its own period
    -- more reliably than a schedule string, and this needs no cron parser.
    cadence as (
      select jobid, percentile_cont(0.5) within group (order by gap) as period
        from (
          select jobid,
                 start_time - lag(start_time) over (partition by jobid order by start_time) as gap,
                 row_number()  over (partition by jobid order by start_time desc) as rn
            from cron.job_run_details
        ) x
       where rn <= 12 and gap is not null
       group by jobid
    ),
    lasterr as (
      select distinct on (jobid) jobid, return_message
        from cron.job_run_details where status <> 'succeeded'
       order by jobid, start_time desc
    )
    select j.jobname, a.last_run, lo.last_ok, a.fails_since_ok, a.first_fail,
           a.oldest_retained, c.period, e.return_message as last_error
      from cron.job j
      left join agg     a  on a.jobid  = j.jobid
      left join last_ok lo on lo.jobid = j.jobid
      left join cadence c  on c.jobid  = j.jobid
      left join lasterr e  on e.jobid  = j.jobid
     where j.active
       and j.jobname is not null
       and j.jobname not in ('aari-job-heartbeat','aari-heartbeat-deadman')
  loop
    v_lower := false;

    if r.last_run is null then
      -- Active, scheduled, and no retained run at all.
      v_state := 'unknown'; v_since := now();

    elsif r.fails_since_ok > 0 then
      v_state := 'failing';
      v_since := r.first_fail;
      -- If every retained run is a failure the onset is older than the window,
      -- so the alert says "at least" rather than claiming a figure.
      v_lower := (r.last_ok is null);

    elsif r.period is not null
          and now() - r.last_run > greatest(r.period * 3, interval '90 minutes') then
      -- Three missed periods, floored at 90 minutes so a five minute job does
      -- not page on a fifteen minute blip.
      v_state := 'stale'; v_since := r.last_run;

    else
      v_state := 'ok'; v_since := coalesce(r.last_ok, r.last_run);
    end if;

    v_edge := public.record_job_health(
      r.jobname, 'cron', v_state, v_since, v_lower,
      r.last_run, r.last_ok, coalesce(r.fails_since_ok,0)::integer, r.period,
      nullif(r.last_error,''),
      jsonb_build_object('oldest_retained', r.oldest_retained));

    job_name := r.jobname; state := v_state; edge := v_edge; return next;
  end loop;
end;
$chs$;

-- The dead man's switch. Pure SQL, no network, no edge function, no dependency
-- on the thing it watches. If the heartbeat stops writing, this notices.
--
-- N is three hours. The heartbeat runs hourly, so three hours tolerates two
-- missed beats before it speaks: one miss is noise, three is a pattern. This
-- itself runs hourly, so the worst case from "heartbeat dies" to "she is told"
-- is four hours. Shorter would page on a single blip and get ignored, which is
-- the failure mode that matters more than four hours of latency.
create or replace function public.heartbeat_deadman(p_max interval default interval '3 hours')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $hd$
declare
  last_beat timestamptz;
begin
  select updated_at into last_beat from realty_job_health where job_name = 'aari-heartbeat';

  if last_beat is null then
    -- Never beat. Either never installed or dead since before this ran.
    return public.record_job_health('aari-heartbeat','probe','stale', now(), true,
             null, null, 0, null, 'The heartbeat has never reported.', null);
  end if;

  if now() - last_beat > p_max then
    return public.record_job_health('aari-heartbeat','probe','stale', last_beat, false,
             last_beat, last_beat, 0, null,
             'The heartbeat has stopped reporting. Nothing is being monitored.', null);
  end if;

  return null;
end;
$hd$;

revoke all on function public.record_job_health(text,text,text,timestamptz,boolean,timestamptz,timestamptz,integer,interval,text,jsonb) from public, anon, authenticated;
revoke all on function public.cron_health_scan() from public, anon, authenticated;
revoke all on function public.heartbeat_deadman(interval) from public, anon, authenticated;

-- The dead man's switch, wired.
--
-- Detection is pure SQL and cannot be taken down by the thing it watches.
-- Delivery needs a network by definition, so it is attempted separately and a
-- delivery failure is recorded on the alert row rather than lost. If the edge
-- runtime itself is down, the alert is still raised and still visible; it just
-- cannot be pushed until the runtime returns. That limit is irreducible and is
-- named in the write-up rather than hidden.
create or replace function public.heartbeat_deadman_run()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $hdr$
declare
  edge text;
begin
  edge := public.heartbeat_deadman();
  perform public.call_edge_function('realty-heartbeat', '{"drain_only":true}'::jsonb);
  return edge;
end;
$hdr$;

revoke all on function public.heartbeat_deadman_run() from public, anon, authenticated;

grant execute on function public.cron_health_scan() to service_role;
grant execute on function public.record_job_health(text,text,text,timestamptz,boolean,timestamptz,timestamptz,integer,interval,text,jsonb) to service_role;
grant execute on function public.heartbeat_deadman(interval) to service_role;

-- Hourly at :40. The estate already uses :00, :05, :07, :10, :15, :20, :25,
-- :30 and :35, so this sits in a quiet minute of its own.
select cron.schedule('aari-job-heartbeat', '40 * * * *',
  $cron$select public.call_edge_function('realty-heartbeat', '{}'::jsonb);$cron$);

-- Hourly at :50, ten minutes behind the beat it watches. Three hours of
-- silence, so two missed beats are tolerated before it speaks: one miss is
-- noise, three is a pattern. Worst case from "heartbeat dies" to "she is told"
-- is four hours, which is the right trade against paging on a single blip.
select cron.schedule('aari-heartbeat-deadman', '50 * * * *',
  $cron$select public.heartbeat_deadman_run();$cron$);

-- Left off deliberately, at the broker's instruction on 5 September 2026. SMS
-- had been failing on Quo prepaid credits since 15 June, so topping the account
-- up would otherwise have brought this back without a decision.
--
-- Re-enable with:
--   select cron.alter_job((select jobid from cron.job where jobname='morning-briefing-sms'), active := true);
select cron.alter_job(
  (select jobid from cron.job where jobname = 'morning-briefing-sms'),
  active := false)
where exists (select 1 from cron.job where jobname = 'morning-briefing-sms');

-- Some delivery failures are not worth retrying.
--
-- Quo answered 402, Payment Required, for 82 days: the request was understood,
-- authenticated, and refused for want of prepaid credit. It would have been
-- refused identically every hour for a week under the retry window, which does
-- not make it likelier to send. It only buries the one line that matters under
-- a hundred identical ones.
--
-- A terminal failure is now recorded once and the retry stops. The alert stays,
-- undelivered and visible, because the alert is still true. Clearing the block
-- is a deliberate act, since the fix is a billing decision and not something a
-- retry can discover.
alter table realty_alerts
  add column if not exists delivery_blocked boolean not null default false,
  add column if not exists delivery_blocked_at timestamptz;

comment on column realty_alerts.delivery_blocked is
  'true when delivery failed for a reason retrying cannot fix, such as HTTP 402 Payment Required or a rejected key. The alert is still undelivered and still true; it is simply no longer being attempted.';

drop index if exists realty_alerts_undelivered_idx;
create index if not exists realty_alerts_undelivered_idx
  on realty_alerts (created_at) where not delivered and not delivery_blocked;
