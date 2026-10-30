-- Novidade com imagem (print da tela) no e-mail: endereço público da imagem.
ALTER TABLE public.product_updates ADD COLUMN IF NOT EXISTS image_url TEXT;
