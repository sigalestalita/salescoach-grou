-- Slugs reservados (www, admin, api…): a leitura era liberada para qualquer
-- usuário logado (USING (true)), e a análise de segurança do Lovable marcava
-- como crítico. Ninguém no app lê a tabela: só provision_organization, que é
-- SECURITY DEFINER e não depende desta política. Fica só para o admin da plataforma.
DROP POLICY IF EXISTS "reserved_slugs_select" ON public.reserved_slugs;
CREATE POLICY "reserved_slugs_select" ON public.reserved_slugs FOR SELECT TO authenticated
  USING (public.is_platform_admin());
