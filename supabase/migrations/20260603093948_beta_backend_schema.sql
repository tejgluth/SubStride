-- SubStride beta backend: Auth-owned run storage, private run artifacts, and AI usage controls.
-- All tables exposed through the Data API have RLS enabled and owner-scoped policies.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Runner',
  height_cm numeric check (height_cm is null or (height_cm >= 80 and height_cm <= 260)),
  weight_kg numeric check (weight_kg is null or (weight_kg >= 25 and weight_kg <= 300)),
  weekly_mileage_km numeric check (weekly_mileage_km is null or weekly_mileage_km >= 0),
  local_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.shoes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_shoe_id text not null,
  name text not null,
  brand text,
  model text,
  size text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_shoe_id),
  unique (id, user_id)
);

create trigger set_shoes_updated_at
before update on public.shoes
for each row execute function public.set_updated_at();

create table public.pods (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_pod_id text not null,
  serial_number text not null,
  nickname text,
  assigned_foot text not null check (assigned_foot in ('left', 'right', 'unknown', 'unassigned')),
  firmware_version text not null,
  hardware_revision text not null,
  last_seen_at timestamptz,
  connection_state text check (connection_state is null or connection_state in ('connected', 'available', 'disconnected')),
  battery_percent integer check (battery_percent is null or (battery_percent >= 0 and battery_percent <= 100)),
  rssi integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_pod_id),
  unique (id, user_id)
);

create trigger set_pods_updated_at
before update on public.pods
for each row execute function public.set_updated_at();

create table public.calibrations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_calibration_id text not null,
  pod_id uuid,
  client_pod_id text,
  shoe_id uuid,
  client_shoe_id text,
  foot text not null check (foot in ('left', 'right', 'unknown')),
  quality text not null check (quality in ('pass', 'warn', 'fail')),
  zone_offsets jsonb not null check (jsonb_typeof(zone_offsets) = 'array'),
  zone_gains jsonb not null check (jsonb_typeof(zone_gains) = 'array'),
  noise_stats jsonb not null check (jsonb_typeof(noise_stats) = 'array'),
  bad_channels jsonb not null default '[]'::jsonb check (jsonb_typeof(bad_channels) = 'array'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_calibration_id),
  unique (id, user_id),
  foreign key (pod_id, user_id) references public.pods(id, user_id) on delete set null,
  foreign key (shoe_id, user_id) references public.shoes(id, user_id) on delete set null
);

create trigger set_calibrations_updated_at
before update on public.calibrations
for each row execute function public.set_updated_at();

create table public.run_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_session_id text not null,
  label text not null,
  scenario text,
  source text not null check (source in ('real_pod', 'simulator', 'imported')),
  mode text not null check (mode in ('run', 'walk', 'treadmill', 'test', 'unknown')),
  surface text,
  workout_type text,
  shoe_id uuid,
  client_shoe_id text,
  pain_score_0_to_10 integer check (pain_score_0_to_10 is null or (pain_score_0_to_10 >= 0 and pain_score_0_to_10 <= 10)),
  perceived_effort_0_to_10 integer check (perceived_effort_0_to_10 is null or (perceived_effort_0_to_10 >= 0 and perceived_effort_0_to_10 <= 10)),
  notes text,
  baseline_status text check (baseline_status is null or baseline_status in ('preliminary', 'baseline_enabled', 'mature')),
  confidence_level text check (confidence_level is null or confidence_level in ('blocked', 'low', 'moderate', 'high')),
  confidence_score numeric check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100)),
  score_showable boolean,
  expected_patterns text[] not null default '{}',
  sync_status text not null default 'synced' check (sync_status in ('not_synced', 'partial', 'synced')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_session_id),
  unique (id, user_id),
  foreign key (shoe_id, user_id) references public.shoes(id, user_id) on delete set null
);

create index run_sessions_user_ended_at_idx on public.run_sessions(user_id, ended_at desc nulls last, created_at desc);
create index run_sessions_user_shoe_idx on public.run_sessions(user_id, client_shoe_id);

create trigger set_run_sessions_updated_at
before update on public.run_sessions
for each row execute function public.set_updated_at();

create table public.run_metrics (
  run_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_training_load_score numeric check (total_training_load_score is null or (total_training_load_score >= 0 and total_training_load_score <= 100)),
  mechanical_load_score numeric check (mechanical_load_score is null or (mechanical_load_score >= 0 and mechanical_load_score <= 100)),
  perceived_load_score numeric check (perceived_load_score is null or (perceived_load_score >= 0 and perceived_load_score <= 100)),
  mechanical_raw_dose numeric,
  mechanical_dose_per_minute numeric,
  mechanical_dose_per_1000_steps numeric,
  perceived_rpe_minutes numeric,
  cadence numeric,
  contact_time_ms numeric,
  total_relative_load numeric,
  peak_load numeric,
  cumulative_load numeric,
  load_rate_proxy numeric,
  impact_proxy numeric,
  fatigue_shift numeric,
  medial_lateral_balance numeric,
  category_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(category_scores) = 'object'),
  distribution jsonb not null default '{}'::jsonb check (jsonb_typeof(distribution) = 'object'),
  confidence jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence) = 'object'),
  metrics_payload jsonb not null check (jsonb_typeof(metrics_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.run_sessions(id, user_id) on delete cascade
);

create index run_metrics_user_load_idx on public.run_metrics(user_id, total_training_load_score);

create trigger set_run_metrics_updated_at
before update on public.run_metrics
for each row execute function public.set_updated_at();

create table public.training_load_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid,
  computed_at timestamptz not null default now(),
  status text not null check (status in ('no_data', 'session_only', 'acute_provisional', 'chronic_provisional', 'full')),
  current_load_score numeric check (current_load_score is null or (current_load_score >= 0 and current_load_score <= 100)),
  mechanical_atl numeric,
  mechanical_ctl numeric,
  perceived_atl numeric,
  perceived_ctl numeric,
  total_atl numeric,
  total_ctl numeric,
  acute_chronic_ratio numeric,
  tolerance_28d numeric,
  monotony_7d numeric,
  strain_7d numeric,
  risk_level text check (risk_level is null or risk_level in ('not_available', 'low', 'moderate', 'elevated')),
  risk_score numeric check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  risk_reasons text[] not null default '{}',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.run_sessions(id, user_id) on delete set null
);

create index training_load_snapshots_user_time_idx on public.training_load_snapshots(user_id, computed_at desc);

create table public.run_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid,
  kind text not null check (kind in ('raw_bundle', 'decoded_frames', 'firmware_log', 'calibration_debug', 'export')),
  storage_bucket text not null default 'run-bundles',
  storage_path text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  foreign key (run_id, user_id) references public.run_sessions(id, user_id) on delete cascade
);

create index run_artifacts_user_run_idx on public.run_artifacts(user_id, run_id);

create table public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table public.ai_explanation_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid,
  client_session_id text,
  request_hash text not null,
  prompt_version text not null,
  model text not null,
  status text not null check (status in ('success', 'blocked', 'rate_limited', 'error')),
  explanation_text text,
  error_code text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.run_sessions(id, user_id) on delete set null
);

create index ai_explanation_logs_user_created_idx on public.ai_explanation_logs(user_id, created_at desc);

create or replace function public.consume_ai_explanation_quota(
  p_user_id uuid,
  p_limit integer,
  p_usage_date date default current_date
)
returns table(allowed boolean, request_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 then
    return query select false, 0;
    return;
  end if;

  insert into public.ai_usage_daily(user_id, usage_date, request_count, updated_at)
  values (p_user_id, p_usage_date, 1, now())
  on conflict (user_id, usage_date) do update
    set request_count = public.ai_usage_daily.request_count + 1,
        updated_at = now()
    where public.ai_usage_daily.request_count < p_limit
  returning true, public.ai_usage_daily.request_count
  into allowed, request_count;

  if found then
    return next;
    return;
  end if;

  select false, public.ai_usage_daily.request_count
    into allowed, request_count
  from public.ai_usage_daily
  where user_id = p_user_id and usage_date = p_usage_date;

  return next;
end;
$$;

revoke all on function public.consume_ai_explanation_quota(uuid, integer, date) from public, anon, authenticated;
grant execute on function public.consume_ai_explanation_quota(uuid, integer, date) to service_role;

alter table public.profiles enable row level security;
alter table public.shoes enable row level security;
alter table public.pods enable row level security;
alter table public.calibrations enable row level security;
alter table public.run_sessions enable row level security;
alter table public.run_metrics enable row level security;
alter table public.training_load_snapshots enable row level security;
alter table public.run_artifacts enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_explanation_logs enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated
using ((select auth.uid()) = id);

create policy "shoes_select_own" on public.shoes for select to authenticated
using ((select auth.uid()) = user_id);
create policy "shoes_insert_own" on public.shoes for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "shoes_update_own" on public.shoes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "shoes_delete_own" on public.shoes for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "pods_select_own" on public.pods for select to authenticated
using ((select auth.uid()) = user_id);
create policy "pods_insert_own" on public.pods for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "pods_update_own" on public.pods for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "pods_delete_own" on public.pods for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "calibrations_select_own" on public.calibrations for select to authenticated
using ((select auth.uid()) = user_id);
create policy "calibrations_insert_own" on public.calibrations for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "calibrations_update_own" on public.calibrations for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "calibrations_delete_own" on public.calibrations for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "run_sessions_select_own" on public.run_sessions for select to authenticated
using ((select auth.uid()) = user_id);
create policy "run_sessions_insert_own" on public.run_sessions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "run_sessions_update_own" on public.run_sessions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "run_sessions_delete_own" on public.run_sessions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "run_metrics_select_own" on public.run_metrics for select to authenticated
using ((select auth.uid()) = user_id);
create policy "run_metrics_insert_own" on public.run_metrics for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "run_metrics_update_own" on public.run_metrics for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "run_metrics_delete_own" on public.run_metrics for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "training_load_snapshots_select_own" on public.training_load_snapshots for select to authenticated
using ((select auth.uid()) = user_id);
create policy "training_load_snapshots_insert_own" on public.training_load_snapshots for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "training_load_snapshots_update_own" on public.training_load_snapshots for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "training_load_snapshots_delete_own" on public.training_load_snapshots for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "run_artifacts_select_own" on public.run_artifacts for select to authenticated
using ((select auth.uid()) = user_id);
create policy "run_artifacts_insert_own" on public.run_artifacts for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "run_artifacts_update_own" on public.run_artifacts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "run_artifacts_delete_own" on public.run_artifacts for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_usage_daily_select_own" on public.ai_usage_daily for select to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_explanation_logs_select_own" on public.ai_explanation_logs for select to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'run-bundles',
  'run-bundles',
  false,
  52428800,
  array['application/json', 'application/octet-stream', 'text/plain']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "run_bundles_select_own_prefix" on storage.objects for select to authenticated
using (
  bucket_id = 'run-bundles'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "run_bundles_insert_own_prefix" on storage.objects for insert to authenticated
with check (
  bucket_id = 'run-bundles'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "run_bundles_update_own_prefix" on storage.objects for update to authenticated
using (
  bucket_id = 'run-bundles'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'run-bundles'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "run_bundles_delete_own_prefix" on storage.objects for delete to authenticated
using (
  bucket_id = 'run-bundles'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.shoes,
  public.pods,
  public.calibrations,
  public.run_sessions,
  public.run_metrics,
  public.training_load_snapshots,
  public.run_artifacts
to authenticated;
grant select on public.ai_usage_daily, public.ai_explanation_logs to authenticated;
