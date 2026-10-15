import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";

// Login expirado no servidor (401) em qualquer função: sai e volta para o login,
// em vez de cada tela quebrar com "Sessão inválida".
const originalInvoke = supabase.functions.invoke.bind(supabase.functions);
supabase.functions.invoke = (async (...args: Parameters<typeof originalInvoke>) => {
  const res = await originalInvoke(...args);
  const status = (res.error as { context?: Response } | null)?.context?.status;
  if (status === 401) {
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.auth.signOut().catch(() => {});
  }
  return res;
}) as typeof supabase.functions.invoke;

createRoot(document.getElementById("root")!).render(<App />);
