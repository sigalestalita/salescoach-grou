import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, ChevronDown, ListOrdered, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tipos de reunião da empresa (ex.: Diagnóstico, Proposta, Follow-up).
 *
 * Aparecem ao criar uma agenda, no cartão da extensão e no treino. Cada tipo
 * pode ter instruções próprias para a análise (prompt_context), que o backend
 * junta ao prompt quando a reunião é daquele tipo. Antes, só dava para mudar
 * pelo banco.
 *
 * A chave é gerada do nome e não muda depois: as reuniões guardam a chave.
 * Tipo já usado em reuniões não é apagado, só desativado.
 */

interface MeetingTypeRow {
  id: string;
  key: string;
  label: string;
  prompt_context: string | null;
  sort_order: number;
  is_active: boolean;
  analysis_template_id: string | null;
}

interface TemplateOption { id: string; methodology_label: string; is_default: boolean; mode: string }

const DEFAULT_METHOD = "padrao";

/** Metodologia de vendas pelo nome; playbook de atendimento marcado como tal. */
const optionLabel = (t: TemplateOption) => (t.mode === "playbook" ? `Playbook: ${t.methodology_label}` : t.methodology_label);

const slugify = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "tipo";

export function MeetingTypesSettings() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<MeetingTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { label: string; prompt_context: string; template: string }>>({});
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    const [{ data, error }, { data: tpls }] = await Promise.all([
      supabase.from("meeting_types")
        .select("id, key, label, prompt_context, sort_order, is_active, analysis_template_id").order("sort_order").order("label"),
      supabase.from("analysis_templates").select("id, methodology_label, is_default, mode").order("is_default", { ascending: false }).order("created_at"),
    ]);
    if (error) toast({ title: "Não foi possível carregar os tipos", description: error.message, variant: "destructive" });
    setRows(data ?? []);
    setTemplates(tpls ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const done = async (msg: string) => {
    toast({ title: msg });
    await load();
    // Formulários e filtros leem os tipos daqui.
    queryClient.invalidateQueries({ queryKey: ["org-config"] });
  };

  const run = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true);
    try { await fn(); await done(msg); } catch (e) {
      toast({ title: "Algo deu errado", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const create = () => run(async () => {
    const label = newLabel.trim();
    if (!label || !orgId) return;
    const base = slugify(label);
    let key = base;
    for (let i = 2; rows.some((r) => r.key === key); i++) key = `${base.slice(0, 37)}_${i}`;
    const { error } = await supabase.from("meeting_types").insert({
      org_id: orgId, key, label, sort_order: (rows.at(-1)?.sort_order ?? 0) + 1, is_active: true,
    });
    if (error) throw error;
    setNewLabel("");
  }, `Tipo "${newLabel.trim()}" criado`);

  const save = (r: MeetingTypeRow) => run(async () => {
    const d = draft[r.id];
    if (!d) return;
    const { error } = await supabase.from("meeting_types")
      .update({
        label: d.label.trim() || r.label,
        prompt_context: d.prompt_context.trim() || null,
        analysis_template_id: d.template === DEFAULT_METHOD ? null : d.template,
      }).eq("id", r.id);
    if (error) throw error;
    setOpenId(null);
  }, "Tipo atualizado");

  const toggle = (r: MeetingTypeRow, active: boolean) => run(async () => {
    if (!active && rows.filter((x) => x.is_active).length <= 1) throw new Error("Deixe pelo menos um tipo ativo.");
    const { error } = await supabase.from("meeting_types").update({ is_active: active }).eq("id", r.id);
    if (error) throw error;
  }, active ? `"${r.label}" ativado` : `"${r.label}" desativado`);

  const move = (index: number, dir: -1 | 1) => run(async () => {
    const other = rows[index + dir];
    const cur = rows[index];
    if (!other) return;
    // Renumera tudo na nova ordem: evita empate de sort_order.
    const next = [...rows];
    next[index] = other; next[index + dir] = cur;
    const results = await Promise.all(next.map((r, i) => supabase.from("meeting_types").update({ sort_order: i + 1 }).eq("id", r.id)));
    const failed = results.find((x) => x.error);
    if (failed?.error) throw failed.error;
  }, "Ordem atualizada");

  const remove = (r: MeetingTypeRow) => run(async () => {
    const { count } = await supabase.from("meetings").select("id", { count: "exact", head: true }).eq("meeting_type", r.key);
    if ((count ?? 0) > 0) {
      throw new Error(`Há ${count} reunião(ões) deste tipo. Desative em vez de apagar, para não perder a referência.`);
    }
    if (rows.filter((x) => x.is_active && x.id !== r.id).length === 0) throw new Error("Deixe pelo menos um tipo ativo.");
    const { error } = await supabase.from("meeting_types").delete().eq("id", r.id);
    if (error) throw error;
  }, `Tipo "${r.label}" apagado`);

  const openRow = (r: MeetingTypeRow) => {
    setOpenId(openId === r.id ? null : r.id);
    setDraft((d) => ({ ...d, [r.id]: d[r.id] ?? { label: r.label, prompt_context: r.prompt_context ?? "", template: r.analysis_template_id ?? DEFAULT_METHOD } }));
  };

  return (
    <Card data-tour="cfg-tipos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><ListOrdered className="h-5 w-5" /> Tipos de reunião</CardTitle>
        <CardDescription>
          Aparecem ao criar uma agenda, no cartão da extensão e no treino. Cada tipo pode ter instruções próprias para a análise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => {
              const isOpen = openId === r.id;
              const d = draft[r.id];
              return (
                <li key={r.id} className={cn("rounded-xl border border-border/70", !r.is_active && "opacity-60")}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="flex flex-col">
                      <button type="button" aria-label="Subir" disabled={busy || i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Descer" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <button type="button" onClick={() => openRow(r)} className="flex flex-1 items-center gap-2 text-left" aria-expanded={isOpen}>
                      <span className="font-medium">{r.label}</span>
                      {r.analysis_template_id && templates.find((t) => t.id === r.analysis_template_id) && (
                        <Badge variant="outline" className="text-[10px]">{optionLabel(templates.find((t) => t.id === r.analysis_template_id)!)}</Badge>
                      )}
                      {r.prompt_context && <Badge variant="secondary" className="text-[10px]">com instruções</Badge>}
                      {!r.is_active && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                      <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>
                    <Switch checked={r.is_active} disabled={busy} onCheckedChange={(v) => toggle(r, v)} aria-label={r.is_active ? "Desativar" : "Ativar"} />
                  </div>
                  {isOpen && d && (
                    <div className="space-y-3 border-t border-border/70 px-3 py-3">
                      <div className="space-y-1.5">
                        <Label>Nome</Label>
                        <Input value={d.label} onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, label: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Metodologia ou playbook de análise</Label>
                        <Select value={d.template} onValueChange={(v) => setDraft({ ...draft, [r.id]: { ...d, template: v } })}
                          onOpenChange={(o) => { if (o) load(); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={DEFAULT_METHOD}>
                              Padrão da empresa{templates.find((t) => t.is_default) ? ` (${templates.find((t) => t.is_default)!.methodology_label})` : ""}
                            </SelectItem>
                            {templates.filter((t) => !t.is_default).map((t) => (
                              <SelectItem key={t.id} value={t.id}>{optionLabel(t)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Crie outras metodologias em Metodologias de análise e playbooks de atendimento em Playbooks de atendimento, logo abaixo.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Instruções para a análise (opcional)</Label>
                        <Textarea rows={4} value={d.prompt_context}
                          onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, prompt_context: e.target.value } })}
                          placeholder="Ex.: numa reunião de diagnóstico, o vendedor deve mapear o processo atual, o decisor e o prazo. Não cobre preço." />
                        <p className="text-xs text-muted-foreground">A IA segue estas instruções ao analisar reuniões deste tipo.</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Apagar
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => save(r)}>Salvar</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {rows.length === 0 && <li className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</li>}
          </ul>
        )}
        <div className="flex gap-2">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Novo tipo (ex.: Follow-up de proposta)"
            onKeyDown={(e) => { if (e.key === "Enter" && newLabel.trim()) create(); }} />
          <Button onClick={create} disabled={busy || !newLabel.trim()}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
