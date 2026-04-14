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
alter publication supabase_realtime add table public.app_state;
