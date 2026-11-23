CREATE OR REPLACE FUNCTION public.invite_status(_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.organization_invites%ROWTYPE;
  v_empresa TEXT;
BEGIN
  SELECT * INTO v FROM public.organization_invites WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalido');
  END IF;
  SELECT name INTO v_empresa FROM public.organizations WHERE id = v.org_id;
  RETURN jsonb_build_object(
    'status', CASE
      WHEN v.accepted_at IS NOT NULL THEN 'aceito'
      WHEN v.revoked_at IS NOT NULL THEN 'cancelado'
      WHEN v.expires_at < now() THEN 'vencido'
      ELSE 'valido' END,
    'email', v.email,
    'empresa', v_empresa,
    'conta_existe', EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(v.email))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_status(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.pending_invites_for_email(_email TEXT)
RETURNS TABLE (token UUID, empresa TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.token, o.name, i.expires_at
  FROM public.organization_invites i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE lower(i.email) = lower(_email)
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.pending_invites_for_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_invites_for_email(TEXT) TO service_role;