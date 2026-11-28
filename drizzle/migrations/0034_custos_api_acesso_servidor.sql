REVOKE ALL ON TABLE public.platform_custos_precos FROM anon, authenticated;
GRANT ALL ON TABLE public.platform_custos_precos TO service_role;
REVOKE ALL ON FUNCTION public.platform_uso_apis(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_uso_apis(TIMESTAMPTZ) TO service_role;