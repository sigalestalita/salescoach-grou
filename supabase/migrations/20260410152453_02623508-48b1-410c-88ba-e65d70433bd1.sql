ALTER TABLE public.meetings DROP CONSTRAINT meetings_temperature_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_temperature_check CHECK (temperature IS NULL OR temperature = ANY (ARRAY['congelado'::text, 'frio'::text, 'morno'::text, 'quente'::text, 'muito_quente'::text]));

ALTER TABLE public.meetings DROP CONSTRAINT meetings_status_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check CHECK (status = ANY (ARRAY['enviado'::text, 'baixando'::text, 'transcrevendo'::text, 'analisando'::text, 'completo'::text, 'erro'::text]));