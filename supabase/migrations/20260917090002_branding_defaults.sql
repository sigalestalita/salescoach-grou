-- ============================================================================
-- Padrões de identidade visual da plataforma.
--
-- Organizações novas passam a nascer com a paleta do produto (navy #071A34,
-- azul #15498D). Organizações que ainda estavam com o padrão antigo — ou seja,
-- que nunca personalizaram — recebem o novo. Quem já escolheu cores próprias
-- não é tocado.
-- ============================================================================

ALTER TABLE public.organization_branding ALTER COLUMN primary_hsl SET DEFAULT '214 74% 32%';
ALTER TABLE public.organization_branding ALTER COLUMN accent_hsl  SET DEFAULT '214 74% 45%';
ALTER TABLE public.organization_branding ALTER COLUMN sidebar_hsl SET DEFAULT '212 76% 12%';

UPDATE public.organization_branding
   SET primary_hsl = '214 74% 32%',
       accent_hsl  = '214 74% 45%',
       sidebar_hsl = '212 76% 12%'
 WHERE primary_hsl = '217 91% 60%'
   AND accent_hsl  = '199 89% 48%'
   AND sidebar_hsl = '222 47% 6%';
