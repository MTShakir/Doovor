-- Visits to the public site, counted without cookies, and where each account came from (D-413).
--
-- The product owner asked to see, in the admin, how many people visit the site and where they come
-- from: a post, a search, a printed code. A page of the site sends one small note as it opens, and
-- only the server writes it here, with nothing about the person who opened it: no internet address,
-- no identifier, no browser string, and the time only to the hour. Somebody who then creates an
-- account carries the tags of the link they came from on to sign-up, and may say how they heard
-- about us; both are kept with the account, are theirs to download, and go when the account does.

-- ---------------------------------------------------------------------------------------
-- A page of the public site, opened.
-- ---------------------------------------------------------------------------------------
create table public.site_visits (
  id uuid primary key default gen_random_uuid(),
  -- To the hour and no finer: enough for the shape of a day, too coarse to pick anybody out.
  occurred_at timestamptz not null default date_trunc('hour', now()),
  path text not null,
  -- The first page of a visit: opened from somewhere else, not from another page of ours.
  entry boolean not null,
  -- The page the visit began on, carried by the pages after it. Unknown when the page that began
  -- it was left by opening another in its place, which forgets it.
  landing text,
  channel text not null,
  source text not null,
  medium text,
  campaign text,
  -- The site the visit came from, never the page: "google.co.uk", not a search.
  referrer text,
  country text,
  region text,
  city text,
  device text not null,
  browser text not null,
  system text not null,
  -- The app whose own browser the page opened in, when it opened inside one.
  app text,
  constraint site_visits_hour check (occurred_at = date_trunc('hour', occurred_at)),
  constraint site_visits_path check (char_length(path) between 1 and 200 and left(path, 1) = '/' and path !~ '[?#[:space:]]'),
  constraint site_visits_landing check (char_length(landing) between 1 and 200 and left(landing, 1) = '/' and landing !~ '[?#[:space:]]'),
  constraint site_visits_entry_lands check (not entry or landing = path),
  constraint site_visits_channel check (channel in ('social', 'search', 'print', 'ai', 'email', 'paid', 'referral', 'direct', 'other')),
  constraint site_visits_source check (source ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  constraint site_visits_medium check (medium ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  constraint site_visits_campaign check (campaign ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  constraint site_visits_referrer check (referrer ~ '^[a-z0-9][a-z0-9.-]{0,99}$'),
  constraint site_visits_country check (country ~ '^[A-Z]{2}$'),
  constraint site_visits_region check (char_length(region) between 1 and 10),
  constraint site_visits_city check (char_length(city) between 1 and 80),
  constraint site_visits_device check (device in ('phone', 'tablet', 'computer')),
  constraint site_visits_browser check (char_length(browser) between 1 and 40),
  constraint site_visits_system check (char_length(system) between 1 and 20),
  constraint site_visits_app check (app in ('instagram', 'facebook', 'tiktok', 'linkedin', 'threads', 'snapchat', 'pinterest', 'x', 'google'))
);

comment on table public.site_visits is
  'Pages of the public site opened, with nothing about who opened them (D-413). Written only by system_record_visit.';

create index site_visits_by_hour on public.site_visits (occurred_at);

alter table public.site_visits enable row level security;

create policy site_visits_staff_read on public.site_visits
  for select to authenticated
  using ((select private.auth_is_staff()));

grant select on public.site_visits to authenticated;

-- ---------------------------------------------------------------------------------------
-- Where an account came from: the tags of the link it arrived on, and the answer to "How did you
-- hear about us?". Either may be missing; a row has at least one.
-- ---------------------------------------------------------------------------------------
create table public.account_origins (
  user_id uuid primary key references public.users (id) on delete cascade,
  source text,
  medium text,
  campaign text,
  channel text,
  heard_about text,
  heard_about_other text,
  created_at timestamptz not null default now(),
  constraint account_origins_source check (source ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  constraint account_origins_medium check (medium ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  constraint account_origins_campaign check (campaign ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  constraint account_origins_channel check (channel in ('social', 'search', 'print', 'ai', 'email', 'paid', 'referral', 'direct', 'other')),
  constraint account_origins_heard_about check (heard_about in (
    'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'threads', 'search', 'ai', 'print', 'word_of_mouth', 'instructor', 'other'
  )),
  constraint account_origins_other check (heard_about_other is null or (char_length(heard_about_other) between 1 and 80 and heard_about = 'other')),
  -- Tags only come with the source they belong to, and a source always with its group.
  constraint account_origins_tags check (source is not null or (medium is null and campaign is null)),
  constraint account_origins_grouped check ((source is null) = (channel is null)),
  constraint account_origins_something check (source is not null or heard_about is not null)
);

comment on table public.account_origins is
  'The link an account arrived on and how its holder said they heard about us (D-413). Theirs to download; gone with the account.';

alter table public.account_origins enable row level security;

create policy account_origins_read on public.account_origins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.auth_is_staff()));

grant select on public.account_origins to authenticated;

-- ---------------------------------------------------------------------------------------
-- Writing a visit: the server only, after it has worked out what the request says (D-413).
-- ---------------------------------------------------------------------------------------
create or replace function public.system_record_visit(
  p_path text,
  p_entry boolean,
  p_landing text,
  p_channel text,
  p_source text,
  p_medium text,
  p_campaign text,
  p_referrer text,
  p_country text,
  p_region text,
  p_city text,
  p_device text,
  p_browser text,
  p_system text,
  p_app text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Far more in one hour than the site has ever seen is not people: whatever sends it is ignored
  -- until the hour turns, rather than filling the table.
  if (select count(*) from public.site_visits v where v.occurred_at = date_trunc('hour', now())) >= 10000 then
    return false;
  end if;

  insert into public.site_visits (
    path, entry, landing, channel, source, medium, campaign, referrer, country, region, city, device, browser, system, app
  )
  values (
    p_path,
    coalesce(p_entry, false),
    case when coalesce(p_entry, false) then p_path else nullif(p_landing, '') end,
    p_channel,
    p_source,
    nullif(p_medium, ''),
    nullif(p_campaign, ''),
    nullif(p_referrer, ''),
    nullif(p_country, ''),
    nullif(p_region, ''),
    nullif(p_city, ''),
    p_device,
    p_browser,
    p_system,
    nullif(p_app, '')
  );
  return true;
end;
$$;

revoke all on function public.system_record_visit(text, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.system_record_visit(text, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text)
  to service_role;

-- Two years of visits are kept, as the privacy notice says, and older ones go each night.
create or replace function public.system_prune_site_visits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gone integer;
begin
  delete from public.site_visits where occurred_at < now() - interval '2 years';
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

revoke all on function public.system_prune_site_visits() from public, anon, authenticated;
grant execute on function public.system_prune_site_visits() to service_role;

-- ---------------------------------------------------------------------------------------
-- An account's origin, written as the account is made. The sign-up form sends what the link said
-- and the answer with the account; anything that is not one of the words allowed is dropped rather
-- than refused, because it is never worth failing a sign-up over.
-- ---------------------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := v_meta ->> 'intended_role';
  -- Ticked on the sign-up form and sent with the account. Anything that is not a version is
  -- treated as not agreed, which leaves them to agree on the screen of its own.
  v_terms text := case when (v_meta ->> 'terms_version') ~ '^\d{4}-\d{2}-\d{2}$' then v_meta ->> 'terms_version' end;
  -- Where they came from (D-413).
  v_source text := case when (v_meta ->> 'arrival_source') ~ '^[a-z0-9][a-z0-9._-]{0,99}$' then v_meta ->> 'arrival_source' end;
  v_medium text := case when (v_meta ->> 'arrival_medium') ~ '^[a-z0-9][a-z0-9._-]{0,59}$' then v_meta ->> 'arrival_medium' end;
  v_campaign text := case when (v_meta ->> 'arrival_campaign') ~ '^[a-z0-9][a-z0-9._-]{0,59}$' then v_meta ->> 'arrival_campaign' end;
  v_channel text := case
    when (v_meta ->> 'arrival_channel') in ('social', 'search', 'print', 'ai', 'email', 'paid', 'referral', 'direct', 'other')
      then v_meta ->> 'arrival_channel'
  end;
  v_heard text := case
    when (v_meta ->> 'heard_about') in (
      'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'threads', 'search', 'ai', 'print', 'word_of_mouth', 'instructor', 'other'
    ) then v_meta ->> 'heard_about'
  end;
  v_other text := case when (v_meta ->> 'heard_about') = 'other' then nullif(left(trim(v_meta ->> 'heard_about_other'), 80), '') end;
begin
  insert into public.users (
    id, email, email_verified_at, phone, phone_verified_at, full_name, avatar_url, intended_role, terms_version, terms_accepted_at
  )
  values (
    new.id,
    new.email,
    new.email_confirmed_at,
    new.phone,
    new.phone_confirmed_at,
    left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), nullif(trim(v_meta ->> 'name'), ''), ''), 120),
    coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    case when v_role in ('learner', 'instructor', 'school') then v_role::public.intended_role end,
    v_terms,
    case when v_terms is not null then now() end
  );

  if v_source is not null or v_heard is not null then
    insert into public.account_origins (user_id, source, medium, campaign, channel, heard_about, heard_about_other)
    values (
      new.id,
      v_source,
      case when v_source is not null then v_medium end,
      case when v_source is not null then v_campaign end,
      case when v_source is not null then coalesce(v_channel, 'other') end,
      v_heard,
      v_other
    );
  end if;

  -- Signed up with Google or Apple: the address arrives confirmed, and they are as new as anybody
  -- who clicked a link. An account made with its email already confirmed is a seed or staff.
  if new.email_confirmed_at is not null
     and coalesce(new.raw_app_meta_data ->> 'provider', 'email') not in ('email', 'phone') then
    perform private.enqueue_event('account/email-confirmed', jsonb_build_object('user_id', new.id));
  end if;
  return new;
end;
$$;

-- Somebody who signed up with Google or Apple chooses what they are on a screen of their own, and
-- says there where they came from. Recorded once, for an account made in the last day: the first
-- answer is the one that counts, and an account that is not new is not news.
create or replace function public.record_account_origin(
  p_source text,
  p_medium text,
  p_campaign text,
  p_channel text,
  p_heard_about text,
  p_heard_about_other text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_source text := nullif(p_source, '');
  v_heard text := nullif(p_heard_about, '');
  v_other text := case when nullif(p_heard_about, '') = 'other' then nullif(left(trim(coalesce(p_heard_about_other, '')), 80), '') end;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if v_source is not null and v_source !~ '^[a-z0-9][a-z0-9._-]{0,99}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "source"}';
  end if;
  if nullif(p_medium, '') !~ '^[a-z0-9][a-z0-9._-]{0,59}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "medium"}';
  end if;
  if nullif(p_campaign, '') !~ '^[a-z0-9][a-z0-9._-]{0,59}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "campaign"}';
  end if;
  if nullif(p_channel, '') not in ('social', 'search', 'print', 'ai', 'email', 'paid', 'referral', 'direct', 'other') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "channel"}';
  end if;
  if v_heard not in (
    'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'threads', 'search', 'ai', 'print', 'word_of_mouth', 'instructor', 'other'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "heard_about"}';
  end if;

  if v_source is null and v_heard is null then
    return false;
  end if;
  if exists (select 1 from public.account_origins o where o.user_id = v_user) then
    return false;
  end if;
  if not exists (select 1 from public.users u where u.id = v_user and u.deleted_at is null and u.created_at > now() - interval '1 day') then
    return false;
  end if;

  insert into public.account_origins (user_id, source, medium, campaign, channel, heard_about, heard_about_other)
  values (
    v_user,
    v_source,
    case when v_source is not null then nullif(p_medium, '') end,
    case when v_source is not null then nullif(p_campaign, '') end,
    case when v_source is not null then coalesce(nullif(p_channel, ''), 'other') end,
    v_heard,
    v_other
  );
  return true;
end;
$$;

revoke all on function public.record_account_origin(text, text, text, text, text, text) from public, anon;
grant execute on function public.record_account_origin(text, text, text, text, text, text) to authenticated;

-- An account that is deleted takes its origin with it: what somebody typed about themselves is
-- about a person, and there is no person now (NFR-PRV-03).
create or replace function private.forget_account_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.account_origins where user_id = new.id;
  return new;
end;
$$;

create trigger users_forget_origin
  after update of deleted_at on public.users
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function private.forget_account_origin();

-- ---------------------------------------------------------------------------------------
-- What somebody can download about themselves gains where they came from. The export so far is
-- kept whole, under a name of its own, and this adds to what it gives.
-- ---------------------------------------------------------------------------------------
alter function public.export_my_data() rename to export_my_data_before_origins;
alter function public.export_my_data_before_origins() set schema private;
revoke all on function private.export_my_data_before_origins() from public, anon, authenticated;

create function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  return private.export_my_data_before_origins() || coalesce((
    select jsonb_build_object('how_you_found_us', jsonb_strip_nulls(jsonb_build_object(
      'link_source', o.source,
      'link_medium', o.medium,
      'link_campaign', o.campaign,
      'answer', o.heard_about,
      'answer_in_your_words', o.heard_about_other,
      'recorded_at', o.created_at
    )))
      from public.account_origins o
     where o.user_id = v_user
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;


-- ---------------------------------------------------------------------------------------
-- The admin's Visitors screen (D-413). Filters arrive as one object of column to value; an empty
-- value asks for the rows where that column is unknown.
-- ---------------------------------------------------------------------------------------
create or replace function private.site_visits_matching(p_from timestamptz, p_to timestamptz, p_filters jsonb)
returns setof public.site_visits
language sql
stable
set search_path = ''
as $$
  select v.*
    from public.site_visits v
   where v.occurred_at >= p_from
     and v.occurred_at < p_to
     and (not (p_filters ? 'channel') or v.channel = p_filters ->> 'channel')
     and (not (p_filters ? 'source') or v.source = p_filters ->> 'source')
     and (not (p_filters ? 'medium') or v.medium = p_filters ->> 'medium' or (p_filters ->> 'medium' = '' and v.medium is null))
     and (not (p_filters ? 'campaign') or v.campaign = p_filters ->> 'campaign' or (p_filters ->> 'campaign' = '' and v.campaign is null))
     and (not (p_filters ? 'landing') or v.landing = p_filters ->> 'landing' or (p_filters ->> 'landing' = '' and v.landing is null))
     and (not (p_filters ? 'page') or v.path = p_filters ->> 'page')
     and (not (p_filters ? 'referrer') or v.referrer = p_filters ->> 'referrer' or (p_filters ->> 'referrer' = '' and v.referrer is null))
     and (not (p_filters ? 'country') or v.country = p_filters ->> 'country' or (p_filters ->> 'country' = '' and v.country is null))
     and (not (p_filters ? 'city') or v.city = p_filters ->> 'city' or (p_filters ->> 'city' = '' and v.city is null))
     and (not (p_filters ? 'device') or v.device = p_filters ->> 'device')
     and (not (p_filters ? 'browser') or v.browser = p_filters ->> 'browser')
     and (not (p_filters ? 'system') or v.system = p_filters ->> 'system')
     and (not (p_filters ? 'app') or v.app = p_filters ->> 'app' or (p_filters ->> 'app' = '' and v.app is null));
$$;

-- Sign-ups as the dashboard counts them (confirmed, not deleted), with where each came from. Only
-- the filters an account has an answer for apply: the rest are about pages, not people.
create or replace function private.signups_matching(p_from timestamptz, p_to timestamptz, p_filters jsonb)
returns table (
  role text,
  source text,
  channel text,
  heard_about text,
  heard_about_other text,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select u.intended_role::text, o.source, o.channel, o.heard_about, o.heard_about_other, u.created_at
    from public.users u
    left join public.account_origins o on o.user_id = u.id
   where u.deleted_at is null
     and (u.email_verified_at is not null or u.phone_verified_at is not null)
     and u.created_at >= p_from
     and u.created_at < p_to
     and (not (p_filters ? 'channel') or o.channel = p_filters ->> 'channel')
     and (not (p_filters ? 'source') or o.source = p_filters ->> 'source')
     and (not (p_filters ? 'medium') or o.medium = p_filters ->> 'medium' or (p_filters ->> 'medium' = '' and o.medium is null))
     and (not (p_filters ? 'campaign') or o.campaign = p_filters ->> 'campaign' or (p_filters ->> 'campaign' = '' and o.campaign is null));
$$;

create or replace function public.site_visits_report(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_before timestamptz;
  v_hourly boolean;
  v_out jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '5 years' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "range"}';
  end if;
  if jsonb_typeof(v_filters) <> 'object' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "filters"}';
  end if;

  -- The same length of time just before, to say whether things went up or down.
  v_before := p_from - (p_to - p_from);
  -- A day or less is drawn hour by hour, keyed by the hour itself; anything longer day by day,
  -- keyed by the date in London.
  v_hourly := p_to - p_from <= interval '25 hours';

  with v as materialized (
    select * from private.site_visits_matching(p_from, p_to, v_filters)
  ),
  buckets as (
    select to_char(b at time zone 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"') as bucket
      from generate_series(p_from, p_to - interval '1 hour', interval '1 hour') b
     where v_hourly
    union all
    select to_char(d, 'YYYY-MM-DD')
      from generate_series(
             (p_from at time zone 'Europe/London')::date::timestamp,
             ((p_to - interval '1 second') at time zone 'Europe/London')::date::timestamp,
             interval '1 day'
           ) d
     where not v_hourly
  ),
  counted as (
    select case when v_hourly
                then to_char(v.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
                else to_char(v.occurred_at at time zone 'Europe/London', 'YYYY-MM-DD') end as bucket,
           v.channel,
           count(*) filter (where v.entry)::integer as visits,
           count(*)::integer as page_views
      from v
     group by 1, 2
  ),
  per_bucket as (
    select c.bucket,
           sum(c.visits)::integer as visits,
           sum(c.page_views)::integer as page_views,
           jsonb_object_agg(c.channel, c.visits) filter (where c.visits > 0) as channels
      from counted c
     group by c.bucket
  ),
  signups_now as (
    select * from private.signups_matching(p_from, p_to, v_filters)
  )
  select jsonb_build_object(
    'hourly', v_hourly,
    'totals', (select jsonb_build_object('visits', count(*) filter (where v.entry), 'page_views', count(*)) from v),
    'before', (
      select jsonb_build_object('visits', count(*) filter (where b.entry), 'page_views', count(*))
        from private.site_visits_matching(v_before, p_from, v_filters) b
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'at', k.bucket,
               'visits', coalesce(p.visits, 0),
               'page_views', coalesce(p.page_views, 0),
               'channels', coalesce(p.channels, '{}'::jsonb)
             ) order by k.bucket), '[]'::jsonb)
        from buckets k
        left join per_bucket p on p.bucket = k.bucket
    ),
    'breakdowns', jsonb_build_object(
      'channel', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key), '[]'::jsonb) from (
        select v.channel as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.channel order by 2 desc, 3 desc, 1 limit 100) t),
      'source', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key), '[]'::jsonb) from (
        select v.source as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.source order by 2 desc, 3 desc, 1 limit 100) t),
      'medium', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.medium as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.medium order by 2 desc, 3 desc, 1 nulls last limit 100) t),
      'campaign', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.campaign as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.campaign order by 2 desc, 3 desc, 1 nulls last limit 100) t),
      'landing', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.landing as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.landing order by 2 desc, 3 desc, 1 nulls last limit 100) t),
      'page', (select coalesce(jsonb_agg(to_jsonb(t) order by t.page_views desc, t.visits desc, t.key), '[]'::jsonb) from (
        select v.path as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.path order by 3 desc, 2 desc, 1 limit 100) t),
      'referrer', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.referrer as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.referrer order by 2 desc, 3 desc, 1 nulls last limit 100) t),
      'country', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.country as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.country order by 2 desc, 3 desc, 1 nulls last limit 100) t),
      'city', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.city as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.city order by 2 desc, 3 desc, 1 nulls last limit 100) t),
      'device', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key), '[]'::jsonb) from (
        select v.device as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.device order by 2 desc, 3 desc, 1 limit 100) t),
      'browser', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key), '[]'::jsonb) from (
        select v.browser as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.browser order by 2 desc, 3 desc, 1 limit 100) t),
      'system', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key), '[]'::jsonb) from (
        select v.system as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.system order by 2 desc, 3 desc, 1 limit 100) t),
      'app', (select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc, t.page_views desc, t.key nulls last), '[]'::jsonb) from (
        select v.app as key, count(*) filter (where v.entry)::integer as visits, count(*)::integer as page_views
          from v group by v.app order by 2 desc, 3 desc, 1 nulls last limit 100) t)
    ),
    'signups', jsonb_build_object(
      'totals', (
        select jsonb_build_object(
          'learners', count(*) filter (where s.role = 'learner'),
          'instructors', count(*) filter (where s.role = 'instructor'),
          'schools', count(*) filter (where s.role = 'school'),
          'undecided', count(*) filter (where s.role is null)
        ) from signups_now s
      ),
      'before', (select count(*) from private.signups_matching(v_before, p_from, v_filters)),
      'by_source', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'key', t.source, 'channel', t.channel,
                 'learners', t.learners, 'instructors', t.instructors, 'schools', t.schools, 'undecided', t.undecided
               ) order by t.total desc, t.source nulls last), '[]'::jsonb)
          from (
            select s.source, max(s.channel) as channel,
                   count(*) filter (where s.role = 'learner')::integer as learners,
                   count(*) filter (where s.role = 'instructor')::integer as instructors,
                   count(*) filter (where s.role = 'school')::integer as schools,
                   count(*) filter (where s.role is null)::integer as undecided,
                   count(*)::integer as total
              from signups_now s
             group by s.source
          ) t
      ),
      'by_answer', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'key', t.heard_about,
                 'learners', t.learners, 'instructors', t.instructors, 'schools', t.schools, 'undecided', t.undecided
               ) order by t.total desc, t.heard_about nulls last), '[]'::jsonb)
          from (
            select s.heard_about,
                   count(*) filter (where s.role = 'learner')::integer as learners,
                   count(*) filter (where s.role = 'instructor')::integer as instructors,
                   count(*) filter (where s.role = 'school')::integer as schools,
                   count(*) filter (where s.role is null)::integer as undecided,
                   count(*)::integer as total
              from signups_now s
             group by s.heard_about
          ) t
      ),
      'in_their_words', (
        select coalesce(jsonb_agg(jsonb_build_object('text', t.heard_about_other, 'role', t.role, 'at', t.created_at)
                                  order by t.created_at desc), '[]'::jsonb)
          from (
            select s.heard_about_other, s.role, s.created_at
              from signups_now s
             where s.heard_about_other is not null
             order by s.created_at desc
             limit 50
          ) t
      )
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.site_visits_report(timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.site_visits_report(timestamptz, timestamptz, jsonb) to authenticated;
revoke all on function private.site_visits_matching(timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function private.signups_matching(timestamptz, timestamptz, jsonb) from public, anon, authenticated;

-- The rows themselves, for the spreadsheet staff can download: the visits the screen shows, newest
-- first, a hundred thousand at most.
create or replace function public.site_visits_rows(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}'::jsonb)
returns table (
  occurred_at timestamptz,
  path text,
  entry boolean,
  landing text,
  channel text,
  source text,
  medium text,
  campaign text,
  referrer text,
  country text,
  region text,
  city text,
  device text,
  browser text,
  system text,
  app text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '5 years' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "range"}';
  end if;
  if jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "filters"}';
  end if;

  return query
    select v.occurred_at, v.path, v.entry, v.landing, v.channel, v.source, v.medium, v.campaign, v.referrer,
           v.country, v.region, v.city, v.device, v.browser, v.system, v.app
      from private.site_visits_matching(p_from, p_to, coalesce(p_filters, '{}'::jsonb)) v
     order by v.occurred_at desc, v.path
     limit 100000;
end;
$$;

revoke all on function public.site_visits_rows(timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.site_visits_rows(timestamptz, timestamptz, jsonb) to authenticated;
