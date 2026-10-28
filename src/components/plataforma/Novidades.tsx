import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Mail, Megaphone, Pencil, Plus, Send, Sparkles, Trash2, Undo2, Archive, CircleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Novidades da plataforma (tela Plataforma): a IA rascunha a partir das
 * mudanças da semana, a administração revisa e publica. Publicada, a novidade
 * aparece no Início de quem usa e entra no e-mail semanal (função
 * product-updates), com a marca de cada empresa.
 */

interface Update {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_path: string | null;
  audience: string[];
  status: "rascunho" | "publicado" | "arquivado";
  source: "manual" | "ia";
  published_at: string | null;
  emailed_at: string | null;
  created_at: string;
}

interface ListResult {
  updates: Update[];
  lastSend: { at: string; sent: number; failed: number } | null;
  resendConfigured: boolean;
  githubConfigured: boolean;
  cronConfigured: boolean;
}

const TELAS: { path: string; label: string }[] = [
  { path: "/", label: "Início" },
  { path: "/agendas", label: "Agendas" },
  { path: "/agendas?visao=agenda", label: "Minha agenda" },
  { path: "/visao-geral", label: "Visão geral" },
  { path: "/conhecimento", label: "Base de conhecimento" },
  { path: "/argumentos", label: "Gerador de argumentos" },
  { path: "/treino", label: "Modo de treino" },
  { path: "/extensao", label: "Extensão do Chrome" },
  { path: "/configuracoes", label: "Configurações" },
  { path: "/equipe", label: "Equipe" },
];
const PAPEIS = [
  { key: "vendedor", label: "Executivos" },
  { key: "gestor", label: "Gestores" },
  { key: "admin", label: "Admins" },
];
const SEM_BOTAO = "_nenhum";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("product-updates", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? "Não foi possível falar com a função de novidades.");
  }
  return data as T;
}

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function Novidades() {
  const { toast } = useToast();
  const [res, setRes] = useState<ListResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Update> | null>(null);
  const [rascunhoAberto, setRascunhoAberto] = useState(false);
  const [notas, setNotas] = useState("");
  const [dias, setDias] = useState("7");
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);

  const load = useCallback(async () => {
    try {
      setRes(await call<ListResult>({ action: "list" }));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ title: ok });
      await load();
    } catch (e) {
      toast({ title: "Não deu certo", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const updates = res?.updates ?? [];
  const aEnviar = updates.filter((u) => u.status === "publicado" && !u.emailed_at);

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg"><Megaphone className="h-5 w-5" /> Novidades e e-mail semanal</CardTitle>
          <CardDescription className="max-w-2xl">
            A IA rascunha as novidades a partir das mudanças da semana; você revisa e publica. Publicadas, aparecem uma vez
            numa janela "O que há de novo" quando cada pessoa abre o Sales Coach, ficam no Início por 30 dias e saem no
            e-mail de segunda, com a marca de cada empresa. Semana sem novidade publicada, sem e-mail.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={() => setRascunhoAberto(true)} disabled={!!busy}><Sparkles className="mr-1.5 h-4 w-4" />Rascunhar com IA</Button>
          <Button size="sm" variant="outline" onClick={() => setEditando({ audience: ["admin", "gestor", "vendedor"] })}><Plus className="mr-1.5 h-4 w-4" />Nova</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && <p className="text-sm text-destructive">{erro} Se a função product-updates ainda não foi publicada, peça o deploy no Lovable.</p>}

        {res && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm">
            <Status ok={res.resendConfigured} label="Envio (Resend)" />
            <Status ok={res.cronConfigured} label="Envio automático de segunda" />
            <Status ok={res.githubConfigured} label="IA lendo as mudanças do GitHub" opcional />
            <span className="text-muted-foreground">
              {res.lastSend ? `Último envio: ${data(res.lastSend.at)}, ${res.lastSend.sent} e-mails${res.lastSend.failed ? `, ${res.lastSend.failed} com erro` : ""}` : "Nenhum e-mail enviado ainda"}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!!busy || !res.resendConfigured}
                onClick={() => run("teste", async () => {
                  const r = await call<{ to: string; count: number }>({ action: "test_email" });
                  toast({ title: "E-mail de teste enviado", description: `Para ${r.to}, com ${r.count} ${r.count === 1 ? "novidade" : "novidades"}.` });
                })}>
                <Mail className="mr-1.5 h-4 w-4" />{busy === "teste" ? "Enviando…" : "Enviar teste para mim"}
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy || !res.resendConfigured || !aEnviar.length} onClick={() => setConfirmarEnvio(true)}>
                <Send className="mr-1.5 h-4 w-4" />Enviar agora
              </Button>
            </div>
          </div>
        )}

        {res && !updates.length && <p className="text-sm text-muted-foreground">Nenhuma novidade ainda. Clique em Rascunhar com IA.</p>}

        <ul className="space-y-3">
          {updates.map((u) => (
            <li key={u.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {u.status === "rascunho" ? <Badge variant="secondary">Rascunho</Badge>
                      : u.emailed_at ? <Badge variant="outline">Enviada em {data(u.emailed_at)}</Badge>
                      : <Badge>Publicada · vai no próximo e-mail</Badge>}
                    {u.source === "ia" && <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />IA</Badge>}
                    <span className="text-xs text-muted-foreground">
                      Para {PAPEIS.filter((p) => u.audience.includes(p.key)).map((p) => p.label.toLowerCase()).join(", ")}
                    </span>
                  </div>
                  <h3 className="font-semibold">{u.title}</h3>
                  <p className="text-sm text-muted-foreground">{u.body}</p>
                  {u.cta_label && <p className="text-xs text-primary">Botão: {u.cta_label} → {TELAS.find((t) => t.path === u.cta_path)?.label ?? u.cta_path}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setEditando(u)} disabled={!!busy}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                  {u.status === "rascunho" ? (
                    <Button size="sm" onClick={() => run(u.id, () => call({ action: "set_status", id: u.id, status: "publicado" }), "Publicada")} disabled={!!busy}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Publicar
                    </Button>
                  ) : !u.emailed_at && (
                    <Button size="sm" variant="outline" onClick={() => run(u.id, () => call({ action: "set_status", id: u.id, status: "rascunho" }), "Voltou a rascunho")} disabled={!!busy}>
                      <Undo2 className="mr-1 h-3.5 w-3.5" />Despublicar
                    </Button>
                  )}
                  {u.status === "rascunho" ? (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(u.id, () => call({ action: "delete", id: u.id }), "Rascunho excluído")} disabled={!!busy}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => run(u.id, () => call({ action: "set_status", id: u.id, status: "arquivado" }), "Arquivada")} disabled={!!busy} title="Arquivar: sai do Início">
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      {/* Rascunho pela IA */}
      <Dialog open={rascunhoAberto} onOpenChange={setRascunhoAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rascunhar novidades com IA</DialogTitle>
            <DialogDescription>
              {res?.githubConfigured
                ? "A IA lê as mudanças publicadas no período e escreve as novidades para quem usa. Nada é publicado sem você."
                : "Escreva o que mudou (um item por linha) e a IA escreve as novidades para quem usa. Com o GITHUB_TOKEN configurado, ela lê as mudanças sozinha."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {res?.githubConfigured && (
              <div className="space-y-1.5">
                <Label>Período</Label>
                <Select value={dias} onValueChange={setDias}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="14">Últimos 14 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{res?.githubConfigured ? "Anotações (opcional)" : "O que mudou"}</Label>
              <Textarea rows={5} value={notas} onChange={(e) => setNotas(e.target.value)}
                placeholder={"Ex.: a extensão grava só o áudio por padrão\nMinha agenda em Agendas"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRascunhoAberto(false)}>Cancelar</Button>
            <Button disabled={busy === "draft"} onClick={() => run("draft", async () => {
              const r = await call<{ updates: Update[]; message?: string }>({ action: "draft", notes: notas, days: Number(dias) });
              toast({ title: r.updates.length ? `${r.updates.length} ${r.updates.length === 1 ? "rascunho criado" : "rascunhos criados"}` : "Nenhum rascunho", description: r.message });
              setRascunhoAberto(false);
              setNotas("");
            })}>
              <Sparkles className="mr-1.5 h-4 w-4" />{busy === "draft" ? "Escrevendo…" : "Rascunhar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar novidade" : "Nova novidade"}</DialogTitle>
            <DialogDescription>Escreva para quem usa: o benefício primeiro, sem o nome do produto (cada empresa vê a própria marca).</DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input maxLength={90} value={editando.title ?? ""} onChange={(e) => setEditando({ ...editando, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Texto</Label>
                <Textarea rows={5} maxLength={900} value={editando.body ?? ""} onChange={(e) => setEditando({ ...editando, body: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Botão leva para</Label>
                  <Select value={editando.cta_path ?? SEM_BOTAO} onValueChange={(v) => setEditando({ ...editando, cta_path: v === SEM_BOTAO ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_BOTAO}>Sem botão</SelectItem>
                      {TELAS.map((t) => <SelectItem key={t.path} value={t.path}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Texto do botão</Label>
                  <Input maxLength={40} disabled={!editando.cta_path} value={editando.cta_label ?? ""} placeholder="Ver na plataforma"
                    onChange={(e) => setEditando({ ...editando, cta_label: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Para quem</Label>
                <div className="flex flex-wrap gap-4">
                  {PAPEIS.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(editando.audience ?? []).includes(p.key)}
                        onCheckedChange={(c) => {
                          const atual = new Set(editando.audience ?? []);
                          if (c) atual.add(p.key); else atual.delete(p.key);
                          setEditando({ ...editando, audience: [...atual] });
                        }}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button disabled={busy === "save"} onClick={() => run("save", async () => {
              await call({ action: "save", ...editando });
              setEditando(null);
            }, "Novidade salva")}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar envio */}
      <Dialog open={confirmarEnvio} onOpenChange={setConfirmarEnvio}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar agora?</DialogTitle>
            <DialogDescription>
              Vai para todos os usuários das empresas ativas, cada um com as novidades do próprio papel ({aEnviar.length}{" "}
              {aEnviar.length === 1 ? "novidade publicada" : "novidades publicadas"}). Quem já recebeu não recebe de novo.
              Mande antes um teste para você.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmarEnvio(false)}>Cancelar</Button>
            <Button disabled={busy === "envio"} onClick={() => run("envio", async () => {
              const r = await call<{ sent: number; failed: number; skipped: number; message?: string }>({ action: "send_now" });
              setConfirmarEnvio(false);
              toast({
                title: r.message ?? `${r.sent} e-mails enviados`,
                description: r.failed ? `${r.failed} com erro. Tente de novo mais tarde: quem já recebeu não recebe outra vez.` : undefined,
                variant: r.failed ? "destructive" : undefined,
              });
            })}>
              <Send className="mr-1.5 h-4 w-4" />{busy === "envio" ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Status({ ok, label, opcional }: { ok: boolean; label: string; opcional?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <CircleAlert className={opcional ? "h-4 w-4 text-muted-foreground" : "h-4 w-4 text-warning"} />}
      <span className={ok ? "" : "text-muted-foreground"}>{label}{!ok && (opcional ? " (opcional)" : ": falta configurar")}</span>
    </span>
  );
}
