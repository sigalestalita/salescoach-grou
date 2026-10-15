import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Loader2, Plus, Sparkles, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Perfis de cliente para o modo de treino.
 *
 * Quem costuma comprar da empresa: segmento, cargo, porte, dores, objeções e
 * como chega. O treino sorteia um perfil (ou usa o escolhido) para montar o
 * lead simulado. Serve sobretudo para empresa nova, que ainda não tem
 * reuniões gravadas de onde tirar dores e objeções reais. A IA sugere perfis a
 * partir da base de conhecimento (função suggest-lead-profiles).
 */

export interface LeadProfileRow {
  id: string;
  name: string;
  segment: string | null;
  role: string | null;
  company_profile: string | null;
  pains: string[];
  objections: string[];
  context: string | null;
  is_active: boolean;
  sort_order: number;
}

type Draft = Omit<LeadProfileRow, "id" | "is_active" | "sort_order" | "pains" | "objections"> & {
  pains: string;
  objections: string;
};

// lead_profiles ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const EMPTY: Draft = { name: "", segment: "", role: "", company_profile: "", pains: "", objections: "", context: "" };
const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
const toDraft = (r: Omit<LeadProfileRow, "id" | "is_active" | "sort_order">): Draft => ({
  name: r.name, segment: r.segment ?? "", role: r.role ?? "", company_profile: r.company_profile ?? "",
  context: r.context ?? "", pains: r.pains.join("\n"), objections: r.objections.join("\n"),
});
const fromDraft = (d: Draft) => ({
  name: d.name.trim(),
  segment: d.segment?.trim() || null,
  role: d.role?.trim() || null,
  company_profile: d.company_profile?.trim() || null,
  context: d.context?.trim() || null,
  pains: lines(d.pains),
  objections: lines(d.objections),
});

function ProfileForm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...draft, [k]: e.target.value });
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Nome do perfil</Label><Input value={draft.name} onChange={set("name")} placeholder="Dono de rede de clínicas odontológicas" /></div>
        <div className="space-y-1.5"><Label>Segmento</Label><Input value={draft.segment ?? ""} onChange={set("segment")} placeholder="Clínica odontológica" /></div>
        <div className="space-y-1.5"><Label>Cargo de quem participa</Label><Input value={draft.role ?? ""} onChange={set("role")} placeholder="Sócio-fundador" /></div>
        <div className="space-y-1.5"><Label>Porte e situação da empresa</Label><Input value={draft.company_profile ?? ""} onChange={set("company_profile")} placeholder="3 unidades, 40 funcionários, fatura R$ 6 mi/ano" /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Dores (uma por linha)</Label>
          <Textarea rows={4} value={draft.pains} onChange={set("pains")} placeholder={"O CAC no Instagram dobrou em um ano\nMetade dos pacientes vem por indicação, mas ninguém mede"} />
        </div>
        <div className="space-y-1.5">
          <Label>Objeções (uma por linha)</Label>
          <Textarea rows={4} value={draft.objections} onChange={set("objections")} placeholder={"Já tentamos programa de indicação e ninguém usou\nPreciso ver com meu sócio"} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Como chega e como decide (opcional)</Label>
        <Textarea rows={2} value={draft.context ?? ""} onChange={set("context")} placeholder="Chega por palestra ou indicação de outro cliente; decide com a sócia; compara com o que gasta em mídia paga." />
      </div>
    </div>
  );
}

export function LeadProfilesSettings() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<LeadProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [creating, setCreating] = useState<Draft | null>(null);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Draft[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await db.from("lead_profiles")
      .select("id, name, segment, role, company_profile, pains, objections, context, is_active, sort_order")
      .order("sort_order").order("created_at");
    if (error) setMissing(/does not exist|schema cache/i.test(error.message ?? ""));
    setRows((data as LeadProfileRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true);
    try { await fn(); toast({ title: msg }); await load(); } catch (e) {
      toast({ title: "Algo deu errado", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const insert = async (list: Draft[]) => {
    if (!orgId) return;
    const base = (rows.at(-1)?.sort_order ?? 0) + 1;
    const payload = list.map((d, i) => ({ org_id: orgId, sort_order: base + i, ...fromDraft(d) }));
    const bad = payload.find((p) => !p.name || p.pains.length === 0);
    if (bad) throw new Error("Cada perfil precisa de nome e de pelo menos uma dor.");
    const { error } = await db.from("lead_profiles").insert(payload);
    if (error) throw error;
  };

  const create = () => creating && run(async () => { await insert([creating]); setCreating(null); }, "Perfil criado");
  const save = (r: LeadProfileRow) => run(async () => {
    const d = drafts[r.id];
    const v = fromDraft(d);
    if (!v.name || v.pains.length === 0) throw new Error("O perfil precisa de nome e de pelo menos uma dor.");
    const { error } = await db.from("lead_profiles").update(v).eq("id", r.id);
    if (error) throw error;
    setOpenId(null);
  }, "Perfil atualizado");
  const toggle = (r: LeadProfileRow, active: boolean) => run(async () => {
    const { error } = await db.from("lead_profiles").update({ is_active: active }).eq("id", r.id);
    if (error) throw error;
  }, active ? `"${r.name}" volta ao treino` : `"${r.name}" fora do treino`);
  const remove = (r: LeadProfileRow) => run(async () => {
    const { error } = await db.from("lead_profiles").delete().eq("id", r.id);
    if (error) throw error;
  }, `Perfil "${r.name}" apagado`);

  const suggest = async () => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-lead-profiles", { body: { focus: focus.trim() || undefined } });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      setSuggestions((data.profiles ?? []).map(toDraft));
    } catch (e) {
      toast({ title: "Não foi possível sugerir perfis", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const addSuggestions = (list: Draft[]) => run(async () => {
    await insert(list);
    setSuggestions((s) => s.filter((x) => !list.includes(x)));
    if (suggestions.length === list.length) setSuggestOpen(false);
  }, list.length === 1 ? `Perfil "${list[0].name}" adicionado` : `${list.length} perfis adicionados`);

  return (
    <Card data-tour="cfg-perfis">
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5" /> Perfis de cliente para o treino</CardTitle>
          <CardDescription className="max-w-2xl">
            Quem costuma comprar da empresa, com dores e objeções. O modo de treino monta o lead simulado a partir destes
            perfis, mesmo antes de existirem reuniões gravadas.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => { setSuggestOpen(true); setSuggestions([]); }} disabled={missing}>
            <Sparkles className="mr-1 h-4 w-4" /> Sugerir com IA
          </Button>
          <Button size="sm" onClick={() => setCreating({ ...EMPTY })} disabled={missing || !!creating}>
            <Plus className="mr-1 h-4 w-4" /> Novo perfil
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {missing && <p className="text-sm text-muted-foreground">Os perfis ficam disponíveis depois da próxima atualização do sistema.</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !missing && rows.length === 0 && !creating ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum perfil ainda. Use <strong className="text-foreground">Sugerir com IA</strong> para gerar perfis a partir da base de
            conhecimento, ou crie o primeiro em <strong className="text-foreground">Novo perfil</strong>.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const isOpen = openId === r.id;
              const d = drafts[r.id];
              return (
                <li key={r.id} className={cn("rounded-xl border border-border/70", !r.is_active && "opacity-60")}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isOpen}
                      onClick={() => { setOpenId(isOpen ? null : r.id); setDrafts((x) => ({ ...x, [r.id]: x[r.id] ?? toDraft(r) })); }}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[r.segment, r.role].filter(Boolean).join(" · ") || "—"} · {r.pains.length} dor(es) · {r.objections.length} objeção(ões)
                        </span>
                      </span>
                      {!r.is_active && <Badge variant="outline" className="text-[10px]">fora do treino</Badge>}
                      <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>
                    <Switch checked={r.is_active} disabled={busy} onCheckedChange={(v) => toggle(r, v)}
                      aria-label={r.is_active ? "Tirar do treino" : "Usar no treino"} />
                  </div>
                  {isOpen && d && (
                    <div className="space-y-3 border-t border-border/70 px-3 py-3">
                      <ProfileForm draft={d} onChange={(nd) => setDrafts((x) => ({ ...x, [r.id]: nd }))} />
                      <div className="flex items-center justify-between gap-2">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => remove(r)}>
                          <Trash2 className="mr-1 h-4 w-4" /> Apagar
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => save(r)}>Salvar</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {creating && (
          <div className="space-y-3 rounded-xl border border-primary/40 p-3">
            <ProfileForm draft={creating} onChange={setCreating} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(null)}>Cancelar</Button>
              <Button size="sm" disabled={busy} onClick={create}>Criar perfil</Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sugerir perfis com IA</DialogTitle>
            <DialogDescription>
              A IA lê a base de conhecimento, o catálogo de dores, os tipos de reunião e as reuniões já analisadas, e propõe
              perfis de quem costuma comprar da empresa. Revise e adicione os que fizerem sentido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="perfis-foco">O que você sabe dos clientes (opcional)</Label>
            <Textarea id="perfis-foco" rows={3} value={focus} onChange={(e) => setFocus(e.target.value)}
              placeholder="Ex.: atendemos muito clínicas e escolas; o decisor costuma ser o dono; chegam por palestra e indicação." />
            <Button onClick={suggest} disabled={suggesting}>
              {suggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {suggestions.length ? "Sugerir de novo" : "Sugerir perfis"}
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div key={`${s.name}-${i}`} className="space-y-2 rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{[s.segment, s.role, s.company_profile].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => addSuggestions([s])}>Adicionar</Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dores</p>
                      <ul className="list-disc pl-4 text-muted-foreground">{lines(s.pains).map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objeções</p>
                      <ul className="list-disc pl-4 text-muted-foreground">{lines(s.objections).map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                  </div>
                  {s.context && <p className="text-muted-foreground">{s.context}</p>}
                </div>
              ))}
            </div>
          )}
          {suggestions.length > 1 && (
            <DialogFooter>
              <Button disabled={busy} onClick={() => addSuggestions(suggestions)}>Adicionar todos ({suggestions.length})</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
