-- Supabase schema for Taibah University demo system
-- نفّذ هذا الملف داخل Supabase SQL Editor مرة واحدة فقط.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Explicit Data API grants required by Supabase's 2026 public schema change.
-- The current web client uses the anon key for app_state sync, so anon needs
-- read/write access here. RLS policies below still control row access.
grant select, insert, update on table public.app_state to anon;
grant select, insert, update on table public.app_state to authenticated;
grant select, insert, update, delete on table public.app_state to service_role;

alter table public.app_state enable row level security;

-- سياسة تجريبية مفتوحة للقراءة والكتابة عبر anon key.
-- مناسبة للاختبار فقط. لا تستخدمها للإنتاج الرسمي.
drop policy if exists "demo read app_state" on public.app_state;
drop policy if exists "demo insert app_state" on public.app_state;
drop policy if exists "demo update app_state" on public.app_state;

create policy "demo read app_state"
on public.app_state for select
to anon, authenticated
using (true);

create policy "demo insert app_state"
on public.app_state for insert
to anon, authenticated
with check (true);

create policy "demo update app_state"
on public.app_state for update
to anon, authenticated
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

-- Explicit Data API grants for AI analyzer tables.
-- Edge Functions can use service_role; authenticated access is limited by RLS.
grant select, insert, update on table public.ai_analysis_runs to authenticated;
grant select, insert, update on table public.ai_recommendations to authenticated;
grant select, insert, update, delete on table public.ai_analysis_runs to service_role;
grant select, insert, update, delete on table public.ai_recommendations to service_role;

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

-- Educational reference document archive metadata.
-- The current static web app stores small document payloads inside app_state for demo use.
-- This relational table is prepared for production metadata and Supabase Storage URLs.
create table if not exists public.educational_reference_documents (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  title text not null,
  college text,
  main_department text,
  section text,
  course_name text,
  course_code text,
  academic_year text,
  semester text,
  linked_evidence_id text,
  file_name text,
  file_type text,
  file_size bigint,
  file_url text,
  status text not null default 'uploaded',
  notes text,
  created_by uuid null,
  created_at timestamptz not null default now(),
  approved_by uuid null,
  approved_at timestamptz null,
  rejected_by uuid null,
  rejected_at timestamptz null,
  rejection_reason text null
);

grant select, insert, update on table public.educational_reference_documents to authenticated;
grant select, insert, update, delete on table public.educational_reference_documents to service_role;

alter table public.educational_reference_documents enable row level security;

drop policy if exists "authenticated read educational_reference_documents" on public.educational_reference_documents;
drop policy if exists "authenticated insert educational_reference_documents" on public.educational_reference_documents;
drop policy if exists "authenticated update educational_reference_documents" on public.educational_reference_documents;

create policy "authenticated read educational_reference_documents"
on public.educational_reference_documents for select
to authenticated
using (
  coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or college = coalesce(auth.jwt()->'app_metadata'->>'college','')
  or college = coalesce(auth.jwt()->'app_metadata'->>'sector','')
);

create policy "authenticated insert educational_reference_documents"
on public.educational_reference_documents for insert
to authenticated
with check (
  coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or college = coalesce(auth.jwt()->'app_metadata'->>'college','')
  or college = coalesce(auth.jwt()->'app_metadata'->>'sector','')
);

create policy "authenticated update educational_reference_documents"
on public.educational_reference_documents for update
to authenticated
using (
  coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or college = coalesce(auth.jwt()->'app_metadata'->>'college','')
  or college = coalesce(auth.jwt()->'app_metadata'->>'sector','')
)
with check (
  coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','system_admin')
  or college = coalesce(auth.jwt()->'app_metadata'->>'college','')
  or college = coalesce(auth.jwt()->'app_metadata'->>'sector','')
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
