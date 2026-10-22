import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { ClipboardList, FilePlus2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HEALTH_LEVELS, PLAYBOOK_PERSONA, PLAYBOOK_PRESETS, PlaybookBody, PlaybookField, PlaybookPreset,
  PlaybookSignal, PlaybookStep, SIGNAL_LABELS, SignalType,
} from "@/lib/playbook";

/**
 * Playbooks de atendimento: a versão do coach para times que não vendem
 * (Customer Success, suporte, onboarding, renovação). Em vez de qualificar
 * uma venda por metodologia, a IA mede a aderência ao playbook da empresa, a
 * saúde do cliente e os sinais de risco e de oportunidade. Cada tipo de
 * reunião aponta para o playbook que o avalia (Configurações → Tipos de
 * reunião); ao criar um playbook, o tipo de reunião já pode nascer ligado.
 */

interface Level { key: string; label: string; criteria?: string }

interface Template {
  id: string;
  methodology_label: string;
  persona: string;
  extra_instructions: string | null;
  qualification_criteria: PlaybookStep[];
  temperature_levels: Level[];
  frameworks: { talk_ratio?: boolean };
  playbook: PlaybookBody;
}

type Draft = Omit<Template, "id"> & { id: string | null };

/** Proposta da função suggest-playbook. */
interface Suggestion {
  nome: string;
  persona: string;
  rationale: string;
  objetivo: string;
  etapas: PlaybookStep[];
  boas_praticas: string[];
  evitar: string[];
  sinais: PlaybookSignal[];
  campos: PlaybookField[];
  temperature_levels: Level[];
  extra_instructions: string;
}

const slugify = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Chaves únicas a partir do rótulo, mantendo as que já existem. */
const withKeys = <T extends { key: string; label: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => i.label.trim()).map((i) => {
    const base = i.key || slugify(i.label) || "item";
    let key = base;
    for (let n = 2; seen.has(key); n++) key = `${base.slice(0, 36)}_${n}`;
    seen.add(key);
    return { ...i, label: i.label.trim(), key };
  });
};

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

const fromPreset = (p: PlaybookPreset): Draft => ({
  id: null,
  methodology_label: p.label,
  persona: PLAYBOOK_PERSONA,
  extra_instructions: null,
  frameworks: { talk_ratio: true },
  qualification_criteria: p.steps.map((s) => ({ ...s })),
  temperature_levels: HEALTH_LEVELS.map((l) => ({ ...l })),
  playbook: JSON.parse(JSON.stringify(p.body)),
});

const empty = (): Draft => ({
  id: null, methodology_label: "", persona: PLAYBOOK_PERSONA, extra_instructions: null, frameworks: { talk_ratio: true },
  qualification_criteria: [{ key: "", label: "", description: "", max_score: 20 }],
  temperature_levels: HEALTH_LEVELS.map((l) => ({ ...l })),
  playbook: { objetivo: "", boas_praticas: [], evitar: [], sinais: [], campos: [] },
});

export const PlaybookSettings = () => {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { refetch } = useOrgConfig();
  const queryClient = useQueryClient();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [usage, setUsage] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [createType, setCreateType] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiType, setAiType] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  // Textos de lista editados como uma linha por item.
  const [praticas, setPraticas] = useState("");
  const [evitar, setEvitar] = useState("");

  const open = useCallback((d: Draft | null) => {
    setDraft(d);
    setPraticas((d?.playbook.boas_praticas ?? []).join("\n"));
    setEvitar((d?.playbook.evitar ?? []).join("\n"));
  }, []);

  const load = useCallback(async (selectId?: string | null) => {
    const [{ data }, { data: types }] = await Promise.all([
      supabase.from("analysis_templates")
        .select("id, methodology_label, persona, extra_instructions, qualification_criteria, temperature_levels, frameworks, playbook")
        .eq("mode", "playbook").order("created_at"),
      supabase.from("meeting_types").select("label, analysis_template_id").eq("is_active", true).order("sort_order"),
    ]);
    const list = (data ?? []).map((t) => ({
      ...t,
      qualification_criteria: Array.isArray(t.qualification_criteria) ? (t.qualification_criteria as unknown as PlaybookStep[]) : [],
      temperature_levels: Array.isArray(t.temperature_levels) ? (t.temperature_levels as unknown as Level[]) : [],
      frameworks: (t.frameworks ?? {}) as Template["frameworks"],
      playbook: (t.playbook ?? {}) as PlaybookBody,
    })) as Template[];
    setTemplates(list);
    const used: Record<string, string[]> = {};
    for (const ty of (types ?? []) as { label: string; analysis_template_id: string | null }[]) {
      if (ty.analysis_template_id) (used[ty.analysis_template_id] ??= []).push(ty.label);
    }
    setUsage(used);
    const pick = list.find((t) => t.id === selectId) ?? list[0] ?? null;
    open(pick ? { ...pick } : null);
    setLoading(false);
  }, [open]);

  useEffect(() => { load(); }, [load]);

  const afterChange = async (selectId?: string | null) => {
    await load(selectId);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ["org-config"] });
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchBody = (p: Partial<PlaybookBody>) => setDraft((d) => (d ? { ...d, playbook: { ...d.playbook, ...p } } : d));
  const setStep = (i: number, p: Partial<PlaybookStep>) =>
    patch({ qualification_criteria: draft!.qualification_criteria.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setSignal = (i: number, p: Partial<PlaybookSignal>) =>
    patchBody({ sinais: (draft!.playbook.sinais ?? []).map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setField = (i: number, p: Partial<PlaybookField>) =>
    patchBody({ campos: (draft!.playbook.campos ?? []).map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setLevel = (i: number, p: Partial<Level>) =>
    patch({ temperature_levels: draft!.temperature_levels.map((l, j) => (j === i ? { ...l, ...p } : l)) });

  const total = draft?.qualification_criteria.reduce((s, c) => s + (Number(c.max_score) || 0), 0) ?? 0;

  const handleSave = async () => {
    if (!orgId || !draft) return;
    const label = draft.methodology_label.trim();
    if (!label) { toast({ title: "Dê um nome ao playbook", variant: "destructive" }); return; }
    const steps = withKeys(draft.qualification_criteria).map((s) => ({
      key: s.key, label: s.label, description: s.description ?? "", max_score: Number(s.max_score) || 10, required: !!s.required,
    }));
    if (steps.length < 2) { toast({ title: "Inclua pelo menos duas etapas", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        // Prefixo no nome: o nome é único por empresa e não pode bater com o de uma metodologia.
        name: `Playbook · ${label}`,
        mode: "playbook",
        is_default: false,
        persona: draft.persona.trim() || PLAYBOOK_PERSONA,
        methodology_key: `PLAYBOOK_${slugify(label).toUpperCase()}`.slice(0, 60),
        methodology_label: label,
        qualification_criteria: steps,
        temperature_levels: withKeys(draft.temperature_levels).map((l) => ({ key: l.key, label: l.label, criteria: l.criteria ?? "" })),
        frameworks: { meddic: false, spin: false, talk_ratio: draft.frameworks.talk_ratio !== false },
        extra_instructions: draft.extra_instructions?.trim() || null,
        playbook: {
          objetivo: draft.playbook.objetivo?.trim() || "",
          boas_praticas: lines(praticas),
          evitar: lines(evitar),
          sinais: withKeys(draft.playbook.sinais ?? []).map((x) => ({ key: x.key, label: x.label, description: x.description ?? "", tipo: x.tipo })),
          campos: withKeys(draft.playbook.campos ?? []).map((x) => ({ key: x.key, label: x.label, description: x.description ?? "" })),
        },
      };
      const isNew = !draft.id;
      const res = draft.id
        ? await supabase.from("analysis_templates").update(payload).eq("id", draft.id).select("id").single()
        : await supabase.from("analysis_templates").insert(payload).select("id").single();
      if (res.error) throw res.error;

      // Novo playbook: o tipo de reunião com o mesmo nome já nasce ligado a ele.
      let typeMsg = "";
      if (isNew && createType) {
        const { data: types } = await supabase.from("meeting_types").select("id, key, sort_order").order("sort_order");
        const base = slugify(label) || "atendimento";
        const existing = (types ?? []).find((t) => t.key === base);
        if (existing) {
          const { error } = await supabase.from("meeting_types").update({ analysis_template_id: res.data.id, is_active: true }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("meeting_types").insert({
            org_id: orgId, key: base, label, is_active: true,
            sort_order: ((types ?? []).at(-1)?.sort_order ?? 0) + 1,
            analysis_template_id: res.data.id,
          });
          if (error) throw error;
        }
        typeMsg = ` O tipo de reunião "${label}" já usa este playbook.`;
      }
      toast({ title: "Playbook salvo", description: `As próximas conversas deste tipo já são avaliadas por ele.${typeMsg}` });
      await afterChange(res.data.id);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    const used = usage[draft.id] ?? [];
    const msg = used.length
      ? `Excluir o playbook ${draft.methodology_label}? ${used.join(", ")} passa(m) a usar a metodologia padrão. As análises já feitas não mudam.`
      : `Excluir o playbook ${draft.methodology_label}? As análises já feitas não mudam.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("analysis_templates").delete().eq("id", draft.id);
      if (error) throw error;
      toast({ title: "Playbook excluído" });
      await afterChange(null);
    } catch (err) {
      toast({ title: "Não foi possível excluir", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const askAi = async () => {
    setAiBusy(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-playbook", { body: { texto: aiText, tipo: aiType } });
      if (error) {
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      setSuggestion(data.suggestion as Suggestion);
    } catch (err) {
      toast({ title: "Não foi possível montar o playbook", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    open({
      id: null,
      methodology_label: suggestion.nome,
      persona: suggestion.persona || PLAYBOOK_PERSONA,
      extra_instructions: suggestion.extra_instructions || null,
      frameworks: { talk_ratio: true },
      qualification_criteria: suggestion.etapas.map((e) => ({ ...e })),
      temperature_levels: suggestion.temperature_levels.length ? suggestion.temperature_levels.map((l) => ({ ...l })) : HEALTH_LEVELS.map((l) => ({ ...l })),
      playbook: {
        objetivo: suggestion.objetivo, boas_praticas: suggestion.boas_praticas, evitar: suggestion.evitar,
        sinais: suggestion.sinais, campos: suggestion.campos,
      },
    });
    setCreateType(true);
    setAiOpen(false);
    toast({ title: "Playbook montado", description: "Revise as etapas e clique em salvar." });
  };

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando playbooks...</CardContent></Card>;
  }

  const usedBy = draft?.id ? usage[draft.id] ?? [] : [];
  const sinais = draft?.playbook.sinais ?? [];
  const campos = draft?.playbook.campos ?? [];

  return (
    <Card data-tour="cfg-playbooks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5" />
          Playbooks de atendimento
        </CardTitle>
        <CardDescription>
          Para times que não vendem, como Customer Success, suporte e onboarding: a IA avalia cada conversa pelo playbook da empresa, mede a saúde do cliente e aponta sinais de risco e de oportunidade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => open({ ...t })}
              className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors",
                draft?.id === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
              {t.methodology_label}
            </button>
          ))}
          {draft && !draft.id && (
            <span className="rounded-full border border-dashed border-primary px-3 py-1.5 text-sm text-primary">
              {draft.methodology_label || "Novo playbook"} (não salvo)
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setNewOpen(true)} data-tour="cfg-playbooks-novo">
            <Plus className="mr-1 h-3.5 w-3.5" /> Novo playbook
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setSuggestion(null); setAiOpen(true); }} data-tour="cfg-playbooks-ia">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Montar a partir do nosso playbook
          </Button>
        </div>

        {!draft && (
          <p className="text-sm text-muted-foreground">
            Nenhum playbook ainda. Comece por um modelo (onboarding, check-in, revisão de resultados, renovação, suporte) ou cole o playbook do seu time e deixe a IA estruturar.
          </p>
        )}

        {draft && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {usedBy.length > 0 && <span>Usado em: {usedBy.join(", ")}</span>}
              {draft.id && usedBy.length === 0 && <span>Nenhum tipo de reunião usa este playbook. Escolha em Tipos de reunião.</span>}
              {!draft.id && (
                <label className="flex items-center gap-2">
                  <Checkbox checked={createType} onCheckedChange={(v) => setCreateType(v === true)} />
                  Criar o tipo de reunião "{draft.methodology_label || "…"}" usando este playbook
                </label>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pb-label">Nome do playbook</Label>
                <Input id="pb-label" value={draft.methodology_label} onChange={(e) => patch({ methodology_label: e.target.value })} placeholder="Onboarding, Check-in, QBR..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pb-persona">Persona da IA</Label>
                <Input id="pb-persona" value={draft.persona} onChange={(e) => patch({ persona: e.target.value })} placeholder={PLAYBOOK_PERSONA} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-objetivo">Objetivo da conversa</Label>
              <Textarea id="pb-objetivo" rows={2} value={draft.playbook.objetivo ?? ""} onChange={(e) => patchBody({ objetivo: e.target.value })}
                placeholder="O que esta conversa precisa alcançar" />
            </div>

            {/* Etapas */}
            <div className="space-y-3" data-tour="cfg-playbooks-etapas">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Etapas do playbook</Label>
                  <p className={cn("text-xs", total === 100 ? "text-muted-foreground" : "text-warning")}>
                    Na ordem em que acontecem. Soma dos pesos: {total}{total !== 100 && " (o ideal é 100)"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => patch({ qualification_criteria: [...draft.qualification_criteria, { key: "", label: "", max_score: 10 }] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar etapa
                </Button>
              </div>
              <div className="space-y-2">
                {draft.qualification_criteria.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
                    <Input aria-label="Etapa" value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} placeholder="Ex: Objetivos do cliente" className="w-52" />
                    <Input aria-label="O que a IA deve observar" value={s.description ?? ""} onChange={(e) => setStep(i, { description: e.target.value })}
                      placeholder="O que conta como etapa cumprida" className="min-w-[200px] flex-1" />
                    <Input aria-label="Peso" type="number" min={1} max={100} value={s.max_score ?? 10} onChange={(e) => setStep(i, { max_score: Number(e.target.value) })} className="w-20" />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch checked={!!s.required} onCheckedChange={(v) => setStep(i, { required: v })} /> Obrigatória
                    </label>
                    <Button type="button" variant="ghost" size="icon" onClick={() => patch({ qualification_criteria: draft.qualification_criteria.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pb-praticas">Boas práticas esperadas</Label>
                <Textarea id="pb-praticas" rows={4} value={praticas} onChange={(e) => setPraticas(e.target.value)} placeholder="Uma por linha" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pb-evitar">O que não pode acontecer</Label>
                <Textarea id="pb-evitar" rows={4} value={evitar} onChange={(e) => setEvitar(e.target.value)} placeholder="Uma por linha" />
              </div>
            </div>

            {/* Sinais */}
            <div className="space-y-3" data-tour="cfg-playbooks-sinais">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Sinais a detectar</Label>
                  <p className="text-xs text-muted-foreground">O que o cliente diz que indica risco, oportunidade ou atenção. Aparecem na análise e no coach ao vivo.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => patchBody({ sinais: [...sinais, { key: "", label: "", tipo: "risco" }] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar sinal
                </Button>
              </div>
              <div className="space-y-2">
                {sinais.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <Select value={s.tipo} onValueChange={(v) => setSignal(i, { tipo: v as SignalType })}>
                      <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SIGNAL_LABELS) as SignalType[]).map((k) => <SelectItem key={k} value={k}>{SIGNAL_LABELS[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input aria-label="Sinal" value={s.label} onChange={(e) => setSignal(i, { label: e.target.value })} placeholder="Ex: Fala em cancelar" className="w-52" />
                    <Input aria-label="Como reconhecer" value={s.description ?? ""} onChange={(e) => setSignal(i, { description: e.target.value })}
                      placeholder="Como reconhecer na conversa" className="min-w-[200px] flex-1" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => patchBody({ sinais: sinais.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {sinais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum sinal configurado.</p>}
              </div>
            </div>

            {/* Informações a registrar */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Informações a registrar</Label>
                  <p className="text-xs text-muted-foreground">A IA anota quando aparecem na conversa (ex.: responsável no cliente, data de go-live).</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => patchBody({ campos: [...campos, { key: "", label: "" }] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {campos.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <Input aria-label="Informação" value={c.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Ex: Data de go-live" className="w-52" />
                    <Input aria-label="Detalhe" value={c.description ?? ""} onChange={(e) => setField(i, { description: e.target.value })} placeholder="Detalhe (opcional)" className="min-w-[200px] flex-1" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => patchBody({ campos: campos.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Saúde do cliente */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Faixas de saúde do cliente</Label>
                  <p className="text-xs text-muted-foreground">Da pior para a melhor. Substituem a temperatura nas conversas deste playbook.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => patch({ temperature_levels: [...draft.temperature_levels, { key: "", label: "", criteria: "" }] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {draft.temperature_levels.map((l, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
                    <Input aria-label="Faixa" value={l.label} onChange={(e) => setLevel(i, { label: e.target.value })} placeholder="Ex: Saudável" className="w-36" />
                    <Input aria-label="Quando o cliente entra nesta faixa" value={l.criteria ?? ""} onChange={(e) => setLevel(i, { criteria: e.target.value })}
                      placeholder="Quando o cliente entra nesta faixa" className="min-w-[220px] flex-1" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => patch({ temperature_levels: draft.temperature_levels.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-regras">Regras da operação</Label>
              <Textarea id="pb-regras" rows={3} value={draft.extra_instructions ?? ""} onChange={(e) => patch({ extra_instructions: e.target.value })}
                placeholder="SLAs, políticas, o que pode ou não ser prometido ao cliente..." />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.frameworks.talk_ratio !== false} onCheckedChange={(v) => patch({ frameworks: { talk_ratio: v } })} />
              Medir a proporção de fala (quem atende × cliente)
            </label>

            <div className="flex flex-wrap justify-between gap-2">
              {draft.id ? (
                <Button type="button" variant="ghost" className="text-destructive" onClick={remove} disabled={saving}>
                  <Trash2 className="mr-1 h-4 w-4" /> Excluir
                </Button>
              ) : <span />}
              <Button type="button" onClick={handleSave} disabled={saving} data-tour="cfg-playbooks-salvar">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar playbook
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {/* Novo playbook: modelos */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo playbook</DialogTitle>
            <DialogDescription>Comece por um modelo e ajuste ao jeito do seu time.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLAYBOOK_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => { open(fromPreset(p)); setCreateType(true); setNewOpen(false); }}
                className="rounded-md border border-border p-3 text-left transition-colors hover:bg-accent">
                <p className="font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.summary}</p>
              </button>
            ))}
            <button type="button" onClick={() => { open(empty()); setCreateType(true); setNewOpen(false); }}
              className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-left transition-colors hover:bg-accent">
              <FilePlus2 className="h-4 w-4" /> <span className="font-medium">Em branco</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Montar com IA a partir do playbook do time */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Montar a partir do nosso playbook</DialogTitle>
            <DialogDescription>
              Cole o playbook do time (roteiro, checklist, política de atendimento). A IA estrutura em etapas, sinais e faixas de saúde, usando também a base de conhecimento. Nada é salvo até você revisar.
            </DialogDescription>
          </DialogHeader>
          {!suggestion ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pb-ai-tipo">Tipo de conversa (opcional)</Label>
                <Input id="pb-ai-tipo" value={aiType} onChange={(e) => setAiType(e.target.value)} placeholder="Ex: Onboarding, Check-in mensal, Renovação" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pb-ai-texto">Playbook do time</Label>
                <Textarea id="pb-ai-texto" rows={10} value={aiText} onChange={(e) => setAiText(e.target.value)}
                  placeholder="Cole aqui o texto do playbook. Se ele estiver num documento da base de conhecimento, pode só descrever o tipo de conversa." />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={askAi} disabled={aiBusy || (!aiText.trim() && !aiType.trim())}>
                  {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Montar playbook
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="font-medium">{suggestion.nome}</p>
              {suggestion.rationale && <p className="text-muted-foreground">{suggestion.rationale}</p>}
              <div>
                <p className="text-xs font-semibold">Etapas</p>
                <ol className="list-decimal space-y-0.5 pl-5">
                  {suggestion.etapas.map((e) => <li key={e.key}>{e.label} <span className="text-muted-foreground">({e.max_score}{e.required ? ", obrigatória" : ""})</span></li>)}
                </ol>
              </div>
              {suggestion.sinais.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {suggestion.sinais.map((s) => <Badge key={s.key} variant="outline" className="text-xs">{SIGNAL_LABELS[s.tipo]}: {s.label}</Badge>)}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSuggestion(null)}>Voltar</Button>
                <Button type="button" onClick={applySuggestion}>Usar este playbook</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
