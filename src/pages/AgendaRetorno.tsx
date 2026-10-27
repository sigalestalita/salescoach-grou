import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { destinoRetornoAgenda } from "@/lib/agendaRetorno";

/** Recebe a volta do Google/Microsoft e repassa para a função da agenda. */
const AgendaRetorno = () => {
  const [invalido, setInvalido] = useState(false);

  useEffect(() => {
    const destino = destinoRetornoAgenda(import.meta.env.VITE_SUPABASE_URL, window.location.search);
    if (destino) window.location.replace(destino);
    else setInvalido(true);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      {invalido ? (
        <div className="space-y-3">
          <p className="text-muted-foreground">Link de autorização inválido ou expirado.</p>
          <Link className="text-primary underline" to="/agendas">Voltar ao Sales Coach</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Conectando a agenda…</p>
      )}
    </div>
  );
};

export default AgendaRetorno;
