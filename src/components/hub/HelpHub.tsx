import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, Compass, Home, LifeBuoy, ListChecks, Mail,
  MessageCircleQuestion, PlayCircle, Search, Sparkles, X,
} from "lucide-react";
import { AssistantPanel } from "./AssistantPanel";
import { HubContext, HubTab } from "./HubContext";
import { Tour } from "./Tour";
import { ARTICLES, articleForPath, FAQ, HelpArticle, TOURS, welcomeTour } from "./content";
import { JourneyStep, useOnboarding } from "./useOnboarding";

/**
 * Central do Sales Coach: um único botão no canto da tela, com quatro abas.
 *
 *   Início      boas-vindas, próximo passo e atalhos
 *   Jornada     etapas de primeiros passos, com progresso
 *   Ajuda       como funciona cada tela, perguntas frequentes, tours
 *   Assistente  o assistente de vendas (antes um botão separado)
 *
 * Juntar tudo num botão só evita dois elementos flutuantes disputando o mesmo
 * canto. No primeiro acesso, a central abre sozinha com as boas-vindas.
 */
export function HelpHub({ children }: { children: React.ReactNode }) {
  const { profile, role, support } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onboarding = useOnboarding();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HubTab>("inicio");
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [tourId, setTourId] = useState<string | null>(null);

  const openHub = useCallback((t: HubTab = "inicio", articleId?: string) => {
    setTab(t);
    setArticle(articleId ? ARTICLES.find((a) => a.id === articleId) ?? null : null);
    setOpen(true);
  }, []);

  const startTour = useCallback((id: string) => {
    setOpen(false);
    setTourId(id);
  }, []);

  // Primeiro acesso: abre com as boas-vindas (uma vez por pessoa).
  useEffect(() => {
    if (support || !onboarding.loaded || onboarding.welcomeSeen) return;
    setTab("inicio");
    setOpen(true);
    onboarding.markWelcomeSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez, quando os dados chegam
  }, [support, onboarding.loaded, onboarding.welcomeSeen]);

  const api = useMemo(() => ({ openHub, startTour }), [openHub, startTour]);
  const tourSteps = tourId === "boas-vindas" ? welcomeTour(role) : tourId ? TOURS[tourId]?.steps ?? [] : [];
  const pending = onboarding.steps.filter((s) => !s.done).length;
  const firstName = (profile?.full_name ?? "").split(" ")[0];

  return (
    <HubContext.Provider value={api}>
      {children}

      <button
        type="button"
        data-tour="hub"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar a central" : "Abrir a central: jornada, ajuda e assistente"}
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-brand-gradient text-white shadow-[0_16px_40px_-14px_hsl(var(--brand-navy)/0.7)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        {!open && pending > 0 && onboarding.loaded && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {pending}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-24 z-50 flex h-[min(620px,calc(100vh-8rem))] flex-col overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-[0_30px_70px_-24px_hsl(var(--brand-navy)/0.5)] sm:inset-x-auto sm:right-5 sm:w-[400px]">
          <div className="flex items-center justify-between gap-2 bg-brand-gradient px-4 py-3 text-white">
            <div className="text-sm font-semibold">{TAB_TITLE[tab]}</div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {tab === "inicio" && (
              <HomeTab
                firstName={firstName}
                firstTime={!onboarding.tourDone}
                next={onboarding.steps.find((s) => !s.done) ?? null}
                progress={onboarding.progress}
                onTour={() => startTour("boas-vindas")}
                onJourney={() => setTab("jornada")}
                onHelp={() => openHub("ajuda", articleForPath(location.pathname)?.id)}
                onAssistant={() => setTab("assistente")}
              />
            )}
            {tab === "jornada" && (
              <JourneyTab
                steps={onboarding.steps}
                progress={onboarding.progress}
                heading={role === "admin" ? "Deixe o Sales Coach pronto para o seu time" : "Comece a usar o Sales Coach"}
                onGo={(s) => { setOpen(false); navigate(s.route); if (s.tour) window.setTimeout(() => setTourId(s.tour!), 400); }}
                onToggle={(s) => onboarding.setManualDone(s.id, !s.manualDone)}
              />
            )}
            {tab === "ajuda" && (
              <HelpTab
                article={article}
                currentPath={location.pathname}
                role={role}
                onOpen={setArticle}
                onTour={startTour}
                onGo={(route) => { setOpen(false); navigate(route); }}
                onAssistant={() => setTab("assistente")}
              />
            )}
            {/* Fica montado depois de aberto, para a conversa não se perder ao trocar de aba. */}
            <div className={cn("min-h-0 flex-1 flex-col", tab === "assistente" ? "flex" : "hidden")}>
              <AssistantPanel open={open && tab === "assistente"} />
            </div>
          </div>

          <nav className="grid grid-cols-4 border-t border-border/70 bg-card" aria-label="Seções da central">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); if (t.id === "ajuda") setArticle(null); }}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  tab === t.id ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
                {t.id === "jornada" && pending > 0 && (
                  <span className="absolute right-[calc(50%-20px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {pending}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      )}

      {tourId && tourSteps.length > 0 && (
        <Tour
          key={tourId}
          steps={tourSteps}
          onClose={(finished) => {
            if (tourId === "boas-vindas") onboarding.markTourDone();
            setTourId(null);
            // Ao terminar o tour de boas-vindas, mostra a jornada.
            if (finished && tourId === "boas-vindas") openHub("jornada");
          }}
        />
      )}
    </HubContext.Provider>
  );
}

const TABS: { id: HubTab; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "jornada", label: "Jornada", icon: ListChecks },
  { id: "ajuda", label: "Ajuda", icon: LifeBuoy },
  { id: "assistente", label: "Assistente", icon: MessageCircleQuestion },
];

const TAB_TITLE: Record<HubTab, string> = {
  inicio: "Central do Sales Coach",
  jornada: "Primeiros passos",
  ajuda: "Ajuda",
  assistente: "Assistente de vendas",
};

// ── Início ──────────────────────────────────────────────────────────────────

function HomeTab(p: {
  firstName: string;
  firstTime: boolean;
  next: JourneyStep | null;
  progress: number;
  onTour: () => void;
  onJourney: () => void;
  onHelp: () => void;
  onAssistant: () => void;
}) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-lg font-semibold">
          {p.firstTime ? `Boas-vindas${p.firstName ? `, ${p.firstName}` : ""}!` : `Olá${p.firstName ? `, ${p.firstName}` : ""}!`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.firstTime
            ? "O Sales Coach grava e analisa suas reuniões de venda e mostra o que fazer melhor. Comece por um tour rápido pelas telas."
            : "Aqui ficam seus primeiros passos, a ajuda de cada tela e o assistente de vendas."}
        </p>
      </div>

      {p.firstTime && (
        <Button className="w-full" onClick={p.onTour}>
          <Compass className="mr-2 h-4 w-4" /> Fazer o tour (1 minuto)
        </Button>
      )}

      <button type="button" onClick={p.onJourney} className="w-full rounded-2xl border border-border/70 p-4 text-left hover:border-primary/40 hover:bg-accent/40">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Primeiros passos</span>
          <span className="text-muted-foreground">{p.progress}%</span>
        </div>
        <Progress value={p.progress} className="mt-2 h-1.5" />
        <p className="mt-3 text-sm text-muted-foreground">
          {p.next ? <>Próximo: <span className="font-medium text-foreground">{p.next.title}</span></> : "Tudo pronto. Bom trabalho!"}
        </p>
      </button>

      <div className="grid grid-cols-1 gap-2">
        {!p.firstTime && (
          <Shortcut icon={Compass} title="Refazer o tour" desc="Uma volta rápida pelas telas" onClick={p.onTour} />
        )}
        <Shortcut icon={BookOpen} title="Como funciona esta tela" desc="Explicação e tour da tela aberta" onClick={p.onHelp} />
        <Shortcut icon={MessageCircleQuestion} title="Perguntar ao assistente" desc="Sobre suas agendas, scores e objeções" onClick={p.onAssistant} />
      </div>
    </div>
  );
}

function Shortcut({ icon: Icon, title, desc, onClick }: { icon: typeof Home; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-left hover:border-primary/40 hover:bg-accent/40">
      <div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{desc}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

// ── Jornada ─────────────────────────────────────────────────────────────────

function JourneyTab({ steps, progress, heading, onGo, onToggle }: {
  steps: JourneyStep[];
  heading: string;
  progress: number;
  onGo: (s: JourneyStep) => void;
  onToggle: (s: JourneyStep) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(() => steps.find((s) => !s.done)?.id ?? null);
  const minutes = steps.filter((s) => !s.done).reduce((n, s) => n + s.minutes, 0);
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold leading-snug">{heading}</h2>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{steps.length} etapas</span>
        <span>{minutes ? `Faltam cerca de ${minutes} minutos` : "Concluída"}</span>
      </div>
      <Progress value={progress} className="mt-2 h-1.5" />

      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => {
          const isOpen = openId === s.id;
          return (
            <li key={s.id} className="rounded-2xl border border-border/70">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-3 py-3 text-left"
              >
                <span className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                  s.done ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
                )}>
                  {s.done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("flex-1 text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="space-y-3 px-3 pb-3 pl-14">
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  {s.done && s.auto && <p className="text-xs text-success">Concluída automaticamente.</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm" onClick={() => onGo(s)}>{s.cta}</Button>
                    {!s.auto && (
                      <button type="button" onClick={() => onToggle(s)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        <Check className="h-3.5 w-3.5" /> {s.manualDone ? "Desmarcar" : "Marcar como concluída"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Ajuda ───────────────────────────────────────────────────────────────────

function HelpTab({ article, currentPath, role, onOpen, onTour, onGo, onAssistant }: {
  article: HelpArticle | null;
  currentPath: string;
  role: string | null;
  onOpen: (a: HelpArticle | null) => void;
  onTour: (id: string) => void;
  onGo: (route: string) => void;
  onAssistant: () => void;
}) {
  const { branding } = useBranding();
  const [q, setQ] = useState("");
  const visible = ARTICLES.filter((a) => !a.roles || (role && a.roles.includes(role)));
  const here = articleForPath(currentPath);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const results = q.trim()
    ? visible.filter((a) => norm([a.title, a.summary, ...a.sections.flatMap((s) => [s.title, ...s.items])].join(" ")).includes(norm(q)))
    : visible;
  const faq = q.trim() ? FAQ.filter((f) => norm(f.q + " " + f.a).includes(norm(q))) : FAQ;

  if (article) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <button type="button" onClick={() => onOpen(null)} className="mb-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Todos os temas
        </button>
        <h2 className="text-lg font-semibold">{article.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {article.tour && TOURS[article.tour] && (
            <Button size="sm" onClick={() => onTour(article.tour!)}><PlayCircle className="mr-1.5 h-4 w-4" /> Ver na tela</Button>
          )}
          {article.route && currentPath !== article.route && (
            <Button size="sm" variant="outline" onClick={() => onGo(article.route!)}>Abrir a tela</Button>
          )}
        </div>
        <div className="mt-4 space-y-4">
          {article.sections.map((s) => (
            <section key={s.title}>
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <ul className="mt-1.5 space-y-1.5 text-sm text-muted-foreground">
                {s.items.map((it) => (
                  <li key={it} className="flex gap-2"><span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" />{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na ajuda" className="pl-9" aria-label="Buscar na ajuda" />
      </div>

      {!q && here && (
        <button type="button" onClick={() => onOpen(here)} className="mt-3 w-full rounded-2xl bg-primary/5 p-3 text-left hover:bg-primary/10">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Nesta tela</div>
          <div className="mt-0.5 text-sm font-medium">{here.title}</div>
          <div className="text-xs text-muted-foreground">{here.summary}</div>
        </button>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como funciona</h3>
      <div className="mt-2 divide-y divide-border/70 rounded-2xl border border-border/70">
        {results.map((a) => (
          <button key={a.id} type="button" onClick={() => onOpen(a)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40">
            <a.icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 text-sm">{a.title}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nada encontrado nos temas.</p>}
      </div>

      {faq.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perguntas frequentes</h3>
          <div className="mt-2 space-y-2">
            {faq.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border/70 px-3 py-2">
                <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-2">{f.q}<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 rounded-2xl border border-dashed border-border p-3 text-sm">
        <p className="font-medium">Ainda com dúvida?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onTour("boas-vindas")}><Compass className="mr-1.5 h-4 w-4" /> Tour geral</Button>
          <Button size="sm" variant="outline" onClick={onAssistant}><MessageCircleQuestion className="mr-1.5 h-4 w-4" /> Assistente</Button>
          {branding.support_email && (
            <Button size="sm" variant="outline" asChild>
              <a href={`mailto:${branding.support_email}`}><Mail className="mr-1.5 h-4 w-4" /> Suporte</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
