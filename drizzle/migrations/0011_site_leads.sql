create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  empresa text not null,
  plano text,
  usuarios integer,
  interesse text not null default 'demonstracao',
  mensagem text,
  origem text,
  user_agent text,
  ip text
);
create index if not exists site_leads_created_at_idx on public.site_leads (created_at desc);
create index if not exists site_leads_ip_created_idx on public.site_leads (ip, created_at desc);
grant all on public.site_leads to service_role;
alter table public.site_leads enable row level security;