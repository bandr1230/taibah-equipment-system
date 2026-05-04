-- Supabase schema for Taibah University demo system
-- نفّذ هذا الملف داخل Supabase SQL Editor مرة واحدة فقط.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.app_state enable row level security;

-- سياسة تجريبية مفتوحة للقراءة والكتابة عبر anon key.
-- مناسبة للاختبار فقط. لا تستخدمها للإنتاج الرسمي.
drop policy if exists "demo read app_state" on public.app_state;
drop policy if exists "demo insert app_state" on public.app_state;
drop policy if exists "demo update app_state" on public.app_state;

create policy "demo read app_state"
on public.app_state for select
to anon
using (true);

create policy "demo insert app_state"
on public.app_state for insert
to anon
with check (true);

create policy "demo update app_state"
on public.app_state for update
to anon
using (true)
with check (true);

-- تفعيل Realtime للجدول حتى تظهر التحديثات بين الأجهزة.
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception
  when duplicate_object then null;
end $$;

-- AI Analyzer relational storage.
-- Edge Function writes with service role. Authenticated policies are ready for production Supabase Auth.
create extension if not exists pgcrypto;

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  analysis_type text not null,
  sector_id uuid null,
  date_from date,
  date_to date,
  requested_by uuid null,
  input_summary jsonb null,
  ai_result_json jsonb not null default '{}'::jsonb,
  status text not null default 'completed',
  confidence_score numeric,
  created_at timestamptz not null default now(),
  approved_by uuid null,
  approved_at timestamptz,
  notes text
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references public.ai_analysis_runs(id) on delete cascade,
  recommendation_type text,
  title text not null,
  description text,
  priority text,
  risk_level text,
  expected_impact text,
  related_entity_type text,
  related_entity_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_by uuid null,
  approved_at timestamptz,
  rejected_by uuid null,
  rejected_at timestamptz,
  rejection_reason text
);

alter table public.ai_analysis_runs enable row level security;
alter table public.ai_recommendations enable row level security;

drop policy if exists "demo read ai_analysis_runs" on public.ai_analysis_runs;
drop policy if exists "demo insert ai_analysis_runs" on public.ai_analysis_runs;
drop policy if exists "demo update ai_analysis_runs" on public.ai_analysis_runs;
drop policy if exists "demo read ai_recommendations" on public.ai_recommendations;
drop policy if exists "demo insert ai_recommendations" on public.ai_recommendations;
drop policy if exists "demo update ai_recommendations" on public.ai_recommendations;
drop policy if exists "authenticated insert ai_analysis_runs" on public.ai_analysis_runs;
drop policy if exists "authenticated read scoped ai_analysis_runs" on public.ai_analysis_runs;
drop policy if exists "authenticated update scoped ai_analysis_runs" on public.ai_analysis_runs;
drop policy if exists "authenticated read scoped ai_recommendations" on public.ai_recommendations;
drop policy if exists "authenticated insert ai_recommendations" on public.ai_recommendations;
drop policy if exists "authenticated update scoped ai_recommendations" on public.ai_recommendations;

create policy "authenticated insert ai_analysis_runs"
on public.ai_analysis_runs for insert
to authenticated
with check (requested_by is null or requested_by = auth.uid());

create policy "authenticated read scoped ai_analysis_runs"
on public.ai_analysis_runs for select
to authenticated
using (
  requested_by = auth.uid()
  or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
);

create policy "authenticated update scoped ai_analysis_runs"
on public.ai_analysis_runs for update
to authenticated
using (
  requested_by = auth.uid()
  or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
)
with check (
  requested_by = auth.uid()
  or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
);

create policy "authenticated read scoped ai_recommendations"
on public.ai_recommendations for select
to authenticated
using (
  exists (
    select 1 from public.ai_analysis_runs run
    where run.id = ai_recommendations.analysis_run_id
    and (
      run.requested_by = auth.uid()
      or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
      or run.sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
    )
  )
);

create policy "authenticated insert ai_recommendations"
on public.ai_recommendations for insert
to authenticated
with check (
  exists (
    select 1 from public.ai_analysis_runs run
    where run.id = ai_recommendations.analysis_run_id
    and (
      run.requested_by = auth.uid()
      or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
      or run.sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
    )
  )
);

create policy "authenticated update scoped ai_recommendations"
on public.ai_recommendations for update
to authenticated
using (
  exists (
    select 1 from public.ai_analysis_runs run
    where run.id = ai_recommendations.analysis_run_id
    and (
      run.requested_by = auth.uid()
      or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
      or run.sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
    )
  )
)
with check (
  exists (
    select 1 from public.ai_analysis_runs run
    where run.id = ai_recommendations.analysis_run_id
    and (
      run.requested_by = auth.uid()
      or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
      or run.sector_id::text = coalesce(auth.jwt()->'app_metadata'->>'sector_id','')
    )
  )
);
