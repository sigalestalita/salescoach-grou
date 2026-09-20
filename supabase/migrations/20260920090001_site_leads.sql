-- ============================================================================
-- Leads do site institucional (salescoach.app.br).
--
-- Escritos exclusivamente pela edge function site-lead, com a service role.
-- Nenhuma política de RLS: a API pública não lê nem escreve. Enquanto não
-- houver tela de admin, a leitura é pelo painel do Supabase.
-- ============================================================================
create table if not exists public.site_leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       text not null,
  empresa     text not null,
  plano       text,                       -- essencial | profissional | enterprise
  usuarios    integer,                    -- tamanho do time informado
  interesse   text not null default 'demonstracao',  -- demonstracao | analise-reuniao
  mensagem    text,
  origem      text,                       -- página/âncora de onde veio
  user_agent  text,
  ip          text                        -- só para o limite de envios por hora
);

create index if not exists site_leads_created_at_idx on public.site_leads (created_at desc);
create index if not exists site_leads_ip_created_idx on public.site_leads (ip, created_at desc);

alter table public.site_leads enable row level security;
