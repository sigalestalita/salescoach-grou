import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/StatCard";
import { isSpeechSupported, startListening, speak, cancelSpeaking } from "@/lib/speech";
import {
  Dumbbell, Loader2, Send, Sparkles, ThumbsUp, ThumbsDown, ListChecks, Target, Thermometer,
  RotateCcw, Mic, MicOff, Volume2, Keyboard, MessageSquare, Phone,
} from "lucide-react";

/**
 * Modo de treino: a IA representa um lead simulado, montado a partir do
 * catálogo de dores e das objeções reais já vistas nas reuniões da própria
 * organização. Duas formas de conversar:
 *   - texto: digitando, como um chat.
 *   - chamada: fala pelo microfone e ouve a resposta em voz — reconhecimento
 *     e síntese de fala rodam no navegador (Chrome/Edge); o backend recebe e
 *     devolve texto normalmente, igual ao modo texto.
 * Ao encerrar, a conversa passa pelo mesmo motor de análise das reuniões
 * reais — mesma nota, mesma metodologia, mesmo formato de feedback.
 */

interface Message {
  role: "seller" | "lead";
  content: string;
}

interface Persona {
  name: string;
  role: string;
  company: string;
  focusPain: string | null;
}

interface Session {
  id: string;
  persona: Persona;
  difficulty: string;
  meeting_type: string | null;
  turn_count: number;
}

interface Feedback {
  overall_score?: number;
  overall_score_reason?: string;
  temperature?: string;
  temperature_reason?: string;
  bant_score?: Record<string, { score: number; reason?: string }>;
  insights?: { positives?: string[]; improvements?: string[] };
  sales_coach?: { next_steps?: string[]; suggestions?: string[] };
}

interface PastSession {
  id: string;
  overall_score: number | null;
  temperature: string | null;
  persona: Persona;
  created_at: string;
}

interface PainOption {
  id: string;
  label: string;
}

type Mode = "texto" | "chamada";
type CallPhase = "idle" | "ouvindo" | "pensando" | "falando";

const DIFFICULTY_LABEL: Record<string, string> = { facil: "Fácil", media: "Média", dificil: "Difícil" };
const DIFFICULTY_TONE: Record<string, string> = { facil: "bg-success/10 text-success", media: "bg-warning/10 text-warning", dificil: "bg-destructive/10 text-destructive" };

const Roleplay = () => {
  const { config } = useOrgConfig();
  const { toast } = useToast();
  const speechOk = isSpeechSupported();

  const [pains, setPains] = useState<PainOption[]>([]);
  const [meetingType, setMeetingType] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("media");
  const [focusPain, setFocusPain] = useState<string>("aleatoria");
  const [mode, setMode] = useState<Mode>("texto");
  const [starting, setStarting] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestFinish, setSuggestFinish] = useState(false);
  const [showTyping, setShowTyping] = useState(false); // fallback de texto dentro do modo chamada

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [liveCaption, setLiveCaption] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const listenHandleRef = useRef<{ stop: () => void } | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [history, setHistory] = useState<PastSession[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("pain_items").select("id, label").order("sort_order").then(({ data }) => setPains(data ?? []));
    loadHistory();
    return () => cancelSpeaking();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, liveCaption]);

  const loadHistory = async () => {
    // A RLS também libera gestor/admin para ver o time (coaching); aqui,
    // dentro da própria prática, restringe aos treinos de quem está logado.
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from("roleplay_sessions")
      .select("id, overall_score, temperature, persona, created_at")
      .eq("status", "concluida")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(6);
    setHistory((data as unknown as PastSession[]) ?? []);
  };

  const startSession = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("roleplay-chat", {
        body: {
          start: {
            meetingType: meetingType || undefined,
            difficulty,
            focusPain: focusPain !== "aleatoria" ? focusPain : undefined,
          },
        },
      });
      if (error) throw new Error(data?.error || error.message);
      setSession(data.session);
      setMessages([]);
      setFeedback(null);
      setSuggestFinish(false);
      setCallPhase("idle");
      setLiveCaption("");
      setShowTyping(false);
    } catch (e: any) {
      toast({ title: "Não foi possível iniciar o treino", description: e.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  // Único caminho de envio, para os dois modos: texto digitado ou fala transcrita.
  const sendMessage = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || !session) return;
    if (mode === "chamada" ? callPhase !== "idle" : sending) return;

    if (!text) setDraft("");
    setLiveCaption("");
    setMessages((prev) => [...prev, { role: "seller", content }]);
    if (mode === "chamada") setCallPhase("pensando");
    else setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("roleplay-chat", { body: { sessionId: session.id, message: content } });
      if (error) throw new Error(data?.error || error.message);
      setMessages((prev) => [...prev, { role: "lead", content: data.reply }]);
      setSuggestFinish(!!data.suggestFinish);
      if (mode === "chamada") {
        setCallPhase("falando");
        await speak(data.reply);
        setCallPhase("idle");
      }
    } catch (e: any) {
      toast({ title: "Erro no treino", description: e.message, variant: "destructive" });
      if (mode === "chamada") setCallPhase("idle");
    } finally {
      if (mode !== "chamada") setSending(false);
    }
  };

  const toggleMic = () => {
    if (callPhase === "ouvindo") {
      listenHandleRef.current?.stop();
      return;
    }
    if (callPhase !== "idle") return;

    setMicError(null);
    setLiveCaption("");
    const handle = startListening({
      onInterim: setLiveCaption,
      onFinal: (text) => sendMessage(text),
      onError: (message) => {
        setMicError(message);
        setCallPhase((p) => (p === "ouvindo" ? "idle" : p));
      },
      onEnd: () => setCallPhase((p) => (p === "ouvindo" ? "idle" : p)),
    });
    if (handle) {
      listenHandleRef.current = handle;
      setCallPhase("ouvindo");
    }
  };

  const finishSession = async () => {
    if (!session) return;
    cancelSpeaking();
    setFinishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("roleplay-finish", { body: { sessionId: session.id } });
      if (error) throw new Error(data?.error || error.message);
      setFeedback(data.session.feedback);
      loadHistory();
    } catch (e: any) {
      toast({ title: "Não foi possível avaliar o treino", description: e.message, variant: "destructive" });
    } finally {
      setFinishing(false);
    }
  };

  const reset = () => {
    cancelSpeaking();
    setSession(null);
    setMessages([]);
    setFeedback(null);
    setSuggestFinish(false);
    setCallPhase("idle");
  };

  const CALL_PHASE_LABEL: Record<CallPhase, string> = {
    idle: "Toque para falar",
    ouvindo: "Ouvindo…",
    pensando: `${session?.persona.name?.split(" ")[0] ?? "O lead"} está pensando…`,
    falando: `${session?.persona.name?.split(" ")[0] ?? "O lead"} está respondendo…`,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-gradient text-white">
          <Dumbbell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Modo de treino</h1>
          <p className="text-sm text-muted-foreground">Pratique objeções reais da sua empresa contra um lead simulado, por texto ou por voz, antes da reunião de verdade.</p>
        </div>
      </div>

      {!session && !feedback && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configure a simulação</CardTitle>
            <CardDescription>A IA monta um lead com uma dor e objeções reais já vistas nas suas reuniões.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipo de reunião</label>
                <Select value={meetingType} onValueChange={setMeetingType}>
                  <SelectTrigger><SelectValue placeholder="Qualquer tipo" /></SelectTrigger>
                  <SelectContent>
                    {config.meetingTypes.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Dificuldade</label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facil">Fácil — lead receptivo</SelectItem>
                    <SelectItem value="media">Média — cético, mas aberto</SelectItem>
                    <SelectItem value="dificil">Difícil — ocupado e desconfiado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Foco da dor</label>
                <Select value={focusPain} onValueChange={setFocusPain}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aleatoria">Aleatória</SelectItem>
                    {pains.map((p) => (
                      <SelectItem key={p.id} value={p.label}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Como você quer treinar</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("texto")}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${mode === "texto" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-accent"}`}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted"><MessageSquare className="h-4 w-4" /></div>
                  <div><div className="text-sm font-medium">Texto</div><div className="text-xs text-muted-foreground">Digite, como num chat</div></div>
                </button>
                <button
                  type="button"
                  onClick={() => speechOk && setMode("chamada")}
                  disabled={!speechOk}
                  title={speechOk ? undefined : "Reconhecimento de voz disponível só no Chrome e no Edge"}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === "chamada" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-accent"}`}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted"><Phone className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-medium">Chamada (voz)</div>
                    <div className="text-xs text-muted-foreground">{speechOk ? "Fale e ouça a resposta" : "Precisa do Chrome ou do Edge"}</div>
                  </div>
                </button>
              </div>
            </div>

            <Button onClick={startSession} disabled={starting} className="w-full md:w-auto">
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Começar treino
            </Button>
          </CardContent>
        </Card>
      )}

      {session && !feedback && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{session.persona.name} · {session.persona.role}</div>
              <div className="truncate text-xs text-muted-foreground">{session.persona.company}{session.persona.focusPain ? ` — dor provável: ${session.persona.focusPain}` : ""}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {mode === "chamada" && <Badge variant="outline" className="rounded-full gap-1"><Phone className="h-3 w-3" />Chamada</Badge>}
              <Badge className={`rounded-full ${DIFFICULTY_TONE[session.difficulty] ?? ""}`}>{DIFFICULTY_LABEL[session.difficulty] ?? session.difficulty}</Badge>
            </div>
          </div>

          <div ref={scrollRef} className="flex max-h-[420px] min-h-[280px] flex-col gap-3 overflow-y-auto p-5">
            {messages.length === 0 && callPhase !== "ouvindo" && (
              <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
                {mode === "chamada" ? "Toque no microfone e abra a reunião como faria de verdade." : `Comece a conversa como se estivesse abrindo a reunião de verdade — ${session.persona.name} está esperando.`}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "seller" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "seller" ? "bg-brand-gradient text-white" : "bg-muted text-foreground"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {mode === "chamada" && callPhase === "ouvindo" && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-sm italic leading-relaxed text-muted-foreground">
                  {liveCaption || "…"}
                </div>
              </div>
            )}
            {(sending || callPhase === "pensando") && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">{session.persona.name.split(" ")[0]} está digitando…</div>
              </div>
            )}
          </div>

          <div className="border-t border-border/70 p-4">
            {suggestFinish && (
              <p className="mb-2 text-xs text-muted-foreground">A conversa já rendeu bastante — quando quiser, encerre para ver a avaliação.</p>
            )}

            {mode === "texto" || showTyping ? (
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Fale como se estivesse na reunião…"
                  className="min-h-[44px] flex-1 resize-none"
                  disabled={sending || callPhase !== "idle"}
                />
                <Button size="icon" onClick={() => sendMessage()} disabled={sending || callPhase !== "idle" || !draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
                {mode === "chamada" && (
                  <Button variant="outline" size="icon" onClick={() => setShowTyping(false)} title="Voltar para o microfone">
                    <Mic className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="outline" onClick={finishSession} disabled={finishing || messages.length < 4}>
                  {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encerrar e avaliar"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2">
                {micError && <p className="text-center text-xs text-destructive">{micError}</p>}
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={callPhase === "pensando" || callPhase === "falando"}
                    aria-label={callPhase === "ouvindo" ? "Parar de ouvir" : "Falar"}
                    className={`relative grid h-16 w-16 place-items-center rounded-full text-white shadow-lg transition-transform disabled:opacity-60 ${
                      callPhase === "ouvindo" ? "bg-destructive scale-105" : "bg-brand-gradient hover:scale-105"
                    }`}
                  >
                    {callPhase === "ouvindo" && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/50" />}
                    {callPhase === "pensando" ? <Loader2 className="h-6 w-6 animate-spin" /> : callPhase === "falando" ? <Volume2 className="h-6 w-6" /> : callPhase === "ouvindo" ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </button>
                  <div className="text-sm text-muted-foreground">{CALL_PHASE_LABEL[callPhase]}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setShowTyping(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Keyboard className="h-3.5 w-3.5" />digitar em vez de falar
                  </button>
                  <Button variant="outline" size="sm" onClick={finishSession} disabled={finishing || messages.length < 4}>
                    {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encerrar e avaliar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {feedback && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard tone="navy" icon={Target} label="Score do treino" value={feedback.overall_score ?? "--"} hint={feedback.overall_score_reason} />
            <StatCard
              tone={feedback.temperature === "quente" || feedback.temperature === "muito_quente" ? "coral" : feedback.temperature === "morno" ? "amber" : "sky"}
              icon={Thermometer}
              label="Temperatura"
              value={feedback.temperature ?? "--"}
              hint={feedback.temperature_reason}
            />
            <StatCard tone="teal" icon={ListChecks} label="Falas trocadas" value={session?.turn_count ?? messages.filter((m) => m.role === "seller").length} hint="Vendedor × lead" />
          </div>

          {feedback.bant_score && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Critérios da metodologia</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {Object.entries(feedback.bant_score).map(([key, val]) => (
                  <div key={key} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>{key}</span><span>{val.score}</span>
                    </div>
                    {val.reason && <p className="mt-1 text-xs text-muted-foreground">{val.reason}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ThumbsUp className="h-4 w-4 text-success" />O que foi bem</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {(feedback.insights?.positives ?? []).map((p, i) => <li key={i}>• {p}</li>)}
                  {!feedback.insights?.positives?.length && <li>Sem destaques.</li>}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ThumbsDown className="h-4 w-4 text-warning" />O que faltou</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {(feedback.insights?.improvements ?? []).map((p, i) => <li key={i}>• {p}</li>)}
                  {!feedback.insights?.improvements?.length && <li>Sem apontamentos.</li>}
                </ul>
              </CardContent>
            </Card>
          </div>

          {!!feedback.sales_coach?.next_steps?.length && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Para a próxima vez</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {feedback.sales_coach.next_steps.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          <Button onClick={reset}><RotateCcw className="h-4 w-4 mr-2" />Novo treino</Button>
        </div>
      )}

      {!!history.length && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Treinos recentes</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-sm font-bold tabular-nums">{h.overall_score ?? "--"}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{h.persona?.name} · {h.persona?.company}</div>
                  <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString("pt-BR")}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Roleplay;
