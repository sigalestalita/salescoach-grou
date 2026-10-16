-- ============================================================================
-- Acesso das empresas no painel da plataforma.
--
-- A dona do produto precisa saber se o cliente de uma demonstração entrou de
-- fato: se aceitou o convite, se entrou com a senha gerada, se já trocou a
-- senha provisória e quando foi o último acesso de cada pessoa.
--
-- O último login fica em auth.users, que o app não lê. Esta função devolve,
-- por organização, as pessoas com login e o último acesso. Só a função
-- platform-orgs chama (service role), e ela já exige platform_admins.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.platform_org_people()
RETURNS TABLE (
  org_id                UUID,
  user_id               UUID,
  email                 TEXT,
  full_name             TEXT,
  role                  TEXT,
  created_at            TIMESTAMP WITH TIME ZONE,
  last_sign_in_at       TIMESTAMP WITH TIME ZONE,
  must_change_password  BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.org_id,
         u.id,
         u.email::TEXT,
         p.full_name,
         (SELECT ur.role::TEXT FROM public.user_roles ur
           WHERE ur.user_id = u.id AND ur.org_id = p.org_id
           ORDER BY CASE ur.role::TEXT WHEN 'admin' THEN 1 WHEN 'gestor' THEN 2 ELSE 3 END
           LIMIT 1),
         u.created_at,
         u.last_sign_in_at,
         COALESCE((u.raw_user_meta_data ->> 'must_change_password')::BOOLEAN, false)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.org_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.platform_org_people() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_org_people() TO service_role;
