import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleQuestion, Send, X, RotateCcw, Loader2 } from "lucide-react";

/**
 * Assistente de vendas em pop-up: acessível de qualquer tela, responde
 * perguntas sobre as agendas com acesso real aos dados da organização (via
 * chamada de ferramentas na edge function, não um resumo estático).
 *
 * Uma conversa por pessoa: abre já com o histórico carregado; "Nova
 * conversa" arquiva a atual e começa outra.
 */

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/**
 * O modelo responde em markdown. Em vez de puxar uma biblioteca inteira só
 * para negrito e lista — ou mostrar os asteriscos crus na tela, como estava
 * acontecendo — o texto é quebrado aqui em elementos React.
 */
function renderRich(text: string) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>,
    );

  return text.split("\n").map((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    if (bullet) {
      return (
        <div key={i} className="flex gap-1.5 pl-0.5">
          <span aria-hidden="true" className="select-none opacity-60">•</span>
          <span>{bold(bullet[1])}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-1.5" />;
    return <div key={i}>{bold(line)}</div>;
  });
}

const SUGGESTIONS = [
  "Quais agendas ficaram mornas essa semana?",
  "Como está o score médio do time este mês?",
  "Quais objeções mais aparecem nas minhas reuniões?",
];

export function SalesAssistant() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const { data: conv } = await supabase
        .from("assistant_conversations")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conv) {
        setConversationId(conv.id);
        const { data: msgs } = await supabase
          .from("assistant_messages")
          .select("role, content")
          .eq("conversation_id", conv.id)
          .order("created_at")
          .limit(50);
        setMessages((msgs as Msg[]) ?? []);
      }
      setLoaded(true);
    })();
  }, [open, loaded]);

  if (!session) return null;

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    setDraft("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content }]);
    setSending(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sales-assistant-chat", {
        body: { conversationId, message: content },
      });
      if (fnError) throw new Error(data?.error || fnError.message);
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch (e: any) {
      setError(e.message || "Não consegui responder agora.");
    } finally {
      setSending(false);
    }
  };

  const startNew = () => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar assistente" : "Abrir assistente de vendas"}
        className="fixed bottom-5 right-5 z-50 flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-4 text-[13px] font-medium text-foreground shadow-float transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
      >
        {open ? <X className="h-4 w-4" /> : <MessageCircleQuestion className="h-4 w-4 text-primary" />}
        {open ? "Fechar" : "Perguntar"}
      </button>

      {open && (
        <div className="fixed bottom-[68px] right-5 z-50 flex h-[min(560px,70vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-float">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="text-[14px] font-medium">Assistente de vendas</div>
              <div className="text-[12px] text-muted-foreground">Pergunte sobre suas agendas</div>
            </div>
            <button type="button" onClick={startNew} title="Nova conversa" aria-label="Nova conversa" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Posso olhar suas agendas, scores e objeções recentes. Exemplos:</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border border-border px-3 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-secondary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] space-y-0.5 rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${m.role === "user" ? "whitespace-pre-wrap bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  {m.role === "assistant" ? renderRich(m.content) : m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-secondary px-3.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> consultando as agendas…
                </div>
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex items-end gap-2 border-t border-border p-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Pergunte algo…"
              className="min-h-[40px] flex-1 resize-none text-sm"
              disabled={sending}
            />
            <Button size="icon" onClick={() => send()} disabled={sending || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
