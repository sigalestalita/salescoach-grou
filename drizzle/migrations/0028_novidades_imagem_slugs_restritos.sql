-- 1. Coluna de imagem das novidades (migração 20261105090000 que faltava).
alter table public.product_updates add column if not exists image_url text;

-- 2. Alerta de segurança: slugs reservados só para o admin da plataforma.
drop policy if exists "reserved_slugs_select" on public.reserved_slugs;
create policy "reserved_slugs_select" on public.reserved_slugs for select to authenticated
  using (public.is_platform_admin());