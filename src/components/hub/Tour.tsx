import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { TourStep } from "./content";

/**
 * Tour guiado: escurece a tela, recorta o elemento da etapa e mostra um balão
 * ao lado. Os elementos são marcados com `data-tour="..."`. Etapa com `route`
 * abre a tela antes; elemento que não existe (menu recolhido no celular, papel
 * sem acesso) vira um balão centralizado, sem recorte.
 */

const PAD = 6;
const CARD_W = 320;

function findTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`));
  // O primeiro visível: a mesma marca pode existir no menu e no conteúdo.
  return all.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (finished: boolean) => void }) {
  const [i, setI] = useState(0);
  // Direção do último passo, para pular etapas opcionais no mesmo sentido.
  const [dir, setDir] = useState<1 | -1>(1);
  // Procurando o elemento da etapa: o balão só aparece depois, para uma
  // etapa opcional sem elemento ser pulada sem piscar na tela.
  const [searching, setSearching] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const step = steps[i];

  // Abre a tela da etapa, se for outra.
  useEffect(() => {
    if (step?.route && location.pathname !== step.route) navigate(step.route);
  }, [step, location.pathname, navigate]);

  // Acha o elemento (a tela pode ainda estar carregando) e acompanha a posição.
  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    let tries = 0;
    let timer: number | undefined;
    const seek = () => {
      const el = findTarget(step?.target);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => { measure(); setSearching(false); }, 350);
      } else if (step?.target && tries++ < 20) {
        timer = window.setTimeout(seek, 100);
      } else if (step?.optional) {
        // Elemento que esta empresa ou papel não tem: segue para a próxima.
        setI((v) => {
          const n = v + dir;
          if (n < 0 || n >= steps.length) { if (n >= steps.length) onClose(true); return v; }
          return n;
        });
      } else {
        setRect(null);
        setSearching(false);
      }
    };
    setRect(null);
    setSearching(!!step?.target);
    seek();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // dir e onClose de propósito fora: onClose muda a cada render do pai e
    // reiniciaria a busca; dir já está atualizado quando a etapa muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, measure, location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") { setDir(-1); setI((v) => Math.max(0, v - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return null;
  const last = i === steps.length - 1;
  function next() {
    if (last) onClose(true);
    else { setDir(1); setI((v) => v + 1); }
  }

  // Posição do balão: abaixo do elemento, ou acima/ao lado quando não cabe.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(CARD_W, vw - 24);
  let cardStyle: React.CSSProperties = { left: (vw - cardW) / 2, top: vh / 2 - 110, width: cardW };
  if (rect) {
    const roomRight = vw - rect.right;
    if (rect.width < vw * 0.3 && roomRight > cardW + 24) {
      // Elemento estreito (item do menu): balão ao lado.
      cardStyle = { left: rect.right + 16, top: Math.min(Math.max(12, rect.top - 8), vh - 240), width: cardW };
    } else if (vh - rect.bottom > 230) {
      cardStyle = { left: Math.min(Math.max(12, rect.left), vw - cardW - 12), top: rect.bottom + 14, width: cardW };
    } else {
      cardStyle = { left: Math.min(Math.max(12, rect.left), vw - cardW - 12), top: Math.max(12, rect.top - 230), width: cardW };
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={step.title}>
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            // Contorno branco + anel da marca: visível tanto no conteúdo claro
            // quanto no menu escuro.
            boxShadow: "0 0 0 2px #fff, 0 0 0 5px hsl(var(--primary) / 0.85), 0 0 0 9999px hsl(var(--brand-navy, 212 76% 12%) / 0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0" style={{ background: "hsl(var(--brand-navy, 212 76% 12%) / 0.62)" }} />
      )}
      {/* Clique fora não fecha: evita perder o tour por engano. */}
      <div className="fixed inset-0" />

      {!searching && (
      <div className="fixed rounded-2xl border border-border/70 bg-card p-4 text-card-foreground shadow-2xl" style={cardStyle}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {i + 1} de {steps.length}
          </p>
          <button type="button" onClick={() => onClose(false)} aria-label="Fechar o tour" className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="font-semibold leading-snug">{step.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => onClose(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Pular tour
          </button>
          <div className="flex gap-2">
            {i > 0 && <Button variant="outline" size="sm" onClick={() => { setDir(-1); setI(i - 1); }}>Anterior</Button>}
            <Button size="sm" onClick={next}>{last ? "Concluir" : "Próximo"}</Button>
          </div>
        </div>
      </div>
      )}
    </div>,
    document.body,
  );
}
