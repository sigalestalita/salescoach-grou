// Os testes importam módulos das edge functions (supabase/functions/_shared),
// que trazem o cliente do Supabase pelo especificador "npm:" do Deno. Para o
// tsc do app, o mesmo pacote já instalado no projeto.
declare module "npm:@supabase/supabase-js@2.49.1" {
  export * from "@supabase/supabase-js";
}
