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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { Brain, Copy, FilePlus2, Loader2, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { METHODOLOGY_PRESETS, MethodologyPreset, PRESET_LEVELS } from "@/lib/methodology";

/**
 * Metodologias de qualificação usadas na análise das reuniões.
 *
 * A empresa pode ter várias (ex.: BANT para a primeira reunião, SPICED para a
 * proposta): uma é a padrão, e cada tipo de reunião pode apontar para outra
 * (Configurações → Tipos de reunião). O backend monta o prompt a partir daqui
 * (supabase/functions/_shared/analysis-template.ts).
 */

interface Criterion {
  key: string;
  label: string;
  description?: string;
  max_score?: number;
}

interface Level {
  key: string;
  label: string;
  criteria?: string;
}

interface Frameworks {
  meddic?: boolean;
  spin?: boolean;
  talk_ratio?: boolean;
}

interface Template {
  id: string;
  is_default: boolean;
  methodology_label: string;
  persona: string;
  extra_instructions: string | null;
  qualification_criteria: Criterion[];
  temperature_levels: Level[];
  frameworks: Frameworks;
}

type Draft = Omit<Template, "id" | "is_default"> & { id: string | null; is_default: boolean };

/** Proposta da função suggest-methodology. */
interface Suggestion {
  methodology_label: string;
  persona: string;
  rationale: string;
  criteria: Criterion[];
  temperature_levels: Level[];
  extra_instructions: string;
  sources: string[];
}

const DEFAULT_PERSONA = "Você é um especialista em vendas B2B.";

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

const fromPreset = (p: MethodologyPreset, base?: Partial<Draft>): Draft => ({
  id: null,
  is_default: false,
  persona: DEFAULT_PERSONA,
  extra_instructions: null,
  frameworks: { meddic: true, spin: true, talk_ratio: true },
  ...base,
  methodology_label: p.label,
  qualification_criteria: p.criteria.map((c) => ({ ...c })),
  temperature_levels: PRESET_LEVELS.map((l) => ({ ...l })),
});

const toDraft = (t: Template): Draft => ({ ...t, frameworks: t.frameworks ?? {} });

export const MethodologySettings = () => {
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
  const [aiOpen, setAiOpen] = useState(false);
  const [aiFocus, setAiFocus] = useState("");
  const [aiType, setAiType] = useState("todas");
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [typeOptions, setTypeOptions] = useState<{ key: string; label: string }[]>([]);

  const load = useCallback(async (selectId?: string | null) => {
    const [{ data }, { data: types }] = await Promise.all([
      supabase.from("analysis_templates")
        .select("id, is_default, methodology_label, persona, extra_instructions, qualification_criteria, temperature_levels, frameworks")
        // Playbooks de atendimento têm a tela própria (PlaybookSettings).
        .eq("mode", "vendas")
        .order("is_default", { ascending: false }).order("created_at"),
      supabase.from("meeting_types").select("key, label, analysis_template_id").eq("is_active", true).order("sort_order"),
    ]);
    const list = (data ?? []).map((t) => ({
      ...t,
      qualification_criteria: Array.isArray(t.qualification_criteria) ? (t.qualification_criteria as unknown as Criterion[]) : [],
      temperature_levels: Array.isArray(t.temperature_levels) ? (t.temperature_levels as unknown as Level[]) : [],
      frameworks: (t.frameworks ?? {}) as Frameworks,
    })) as Template[];
    setTemplates(list);
    const used: Record<string, string[]> = {};
    for (const ty of (types ?? []) as { label: string; analysis_template_id: string | null }[]) {
      if (ty.analysis_template_id) (used[ty.analysis_template_id] ??= []).push(ty.label);
    }
    setUsage(used);
    setTypeOptions(((types ?? []) as { key: string; label: string }[]).map((t) => ({ key: t.key, label: t.label })));
    const pick = list.find((t) => t.id === selectId) ?? list.find((t) => t.is_default) ?? list[0];
    // Empresa sem metodologia salva: começa pelo BANT, que já é o que a análise usa.
    setDraft(pick ? toDraft(pick) : { ...fromPreset(METHODOLOGY_PRESETS[0]), is_default: true });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const afterChange = async (selectId?: string | null) => {
    await load(selectId);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ["org-config"] });
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const updateCriterion = (index: number, p: Partial<Criterion>) =>
    patch({ qualification_criteria: draft!.qualification_criteria.map((c, i) => (i === index ? { ...c, ...p } : c)) });
  const updateLevel = (index: number, p: Partial<Level>) =>
    patch({ temperature_levels: draft!.temperature_levels.map((l, i) => (i === index ? { ...l, ...p } : l)) });

  const total = draft?.qualification_criteria.reduce((s, c) => s + (Number(c.max_score) || 0), 0) ?? 0;

  const handleSave = async () => {
    if (!orgId || !draft) return;
    if (!draft.methodology_label.trim()) {
      toast({ title: "Dê um nome à metodologia", variant: "destructive" });
      return;
    }
    if (!draft.qualification_criteria.some((c) => c.label.trim())) {
      toast({ title: "Inclua pelo menos um critério", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const label = draft.methodology_label.trim();
      const payload = {
        org_id: orgId,
        name: label,
        is_default: draft.is_default || templates.length === 0,
        persona: draft.persona || DEFAULT_PERSONA,
        methodology_key: slugify(label).toUpperCase() || "CUSTOM",
        methodology_label: label,
        qualification_criteria: draft.qualification_criteria
          .filter((c) => c.label.trim())
          .map((c) => ({ ...c, key: c.key || slugify(c.label), max_score: Number(c.max_score) || 25 })),
        temperature_levels: draft.temperature_levels
          .filter((l) => l.label.trim())
          .map((l) => ({ ...l, key: l.key || slugify(l.label) })),
        frameworks: { meddic: draft.frameworks.meddic !== false, spin: draft.frameworks.spin !== false, talk_ratio: true },
        extra_instructions: draft.extra_instructions || null,
      };
      const res = draft.id
        ? await supabase.from("analysis_templates").update(payload).eq("id", draft.id).select("id").single()
        : await supabase.from("analysis_templates").insert(payload).select("id").single();
      if (res.error) throw res.error;
      toast({ title: "Metodologia salva", description: "As próximas análises já usam estes critérios." });
      await afterChange(res.data.id);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async () => {
    if (!draft?.id) return;
    setSaving(true);
    try {
      // Uma padrão por empresa (índice único): primeiro tira a atual.
      const { error: e1 } = await supabase.from("analysis_templates").update({ is_default: false }).eq("is_default", true).neq("id", draft.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("analysis_templates").update({ is_default: true }).eq("id", draft.id);
      if (e2) throw e2;
      toast({ title: `${draft.methodology_label} agora é a padrão`, description: "Vale para os tipos de reunião sem metodologia própria." });
      await afterChange(draft.id);
    } catch (err) {
      toast({ title: "Não foi possível mudar a padrão", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || draft.is_default) return;
    const used = usage[draft.id] ?? [];
    const msg = used.length
      ? `Excluir ${draft.methodology_label}? ${used.join(", ")} passa(m) a usar a metodologia padrão. As análises já feitas não mudam.`
      : `Excluir ${draft.methodology_label}? As análises já feitas não mudam.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("analysis_templates").delete().eq("id", draft.id);
      if (error) throw error;
      toast({ title: "Metodologia excluída" });
      await afterChange(null);
    } catch (err) {
      toast({ title: "Não foi possível excluir", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyPresetToDraft = (presetId: string) => {
    const p = METHODOLOGY_PRESETS.find((x) => x.id === presetId);
    if (!p || !draft) return;
    if (!confirm(`Trocar o nome, os critérios e as faixas desta metodologia pelos do ${p.label}? Persona, regras e análises extras ficam como estão.`)) return;
    setDraft(fromPreset(p, { id: draft.id, is_default: draft.is_default, persona: draft.persona, extra_instructions: draft.extra_instructions, frameworks: draft.frameworks }));
  };

  // ── Sugestão pela IA a partir da base de conhecimento ──
  const askAi = async () => {
    setAiBusy(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-methodology", {
        body: { focus: aiFocus, meetingTypeKey: aiType === "todas" ? null : aiType },
      });
      if (error) {
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      setSuggestion(data.suggestion as Suggestion);
    } catch (err) {
      toast({ title: "Não foi possível sugerir", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const applySuggestion = (asNew: boolean) => {
    if (!suggestion || !draft) return;
    const base = asNew
      ? { id: null, is_default: templates.length === 0, frameworks: { meddic: true, spin: true, talk_ratio: true } }
      : { id: draft.id, is_default: draft.is_default, frameworks: draft.frameworks };
    setDraft({
      ...base,
      methodology_label: suggestion.methodology_label,
      persona: suggestion.persona || draft.persona || DEFAULT_PERSONA,
      extra_instructions: suggestion.extra_instructions || null,
      qualification_criteria: suggestion.criteria.map((c) => ({ ...c })),
      temperature_levels: suggestion.temperature_levels.length ? suggestion.temperature_levels.map((l) => ({ ...l })) : PRESET_LEVELS.map((l) => ({ ...l })),
    });
    setAiOpen(false);
    setNewOpen(false);
    toast({ title: "Sugestão carregada", description: "Revise os critérios e clique em salvar." });
  };

  const startNew = (p: MethodologyPreset | null, copyCurrent = false) => {
    setNewOpen(false);
    if (copyCurrent && draft) {
      setDraft({ ...draft, id: null, is_default: false, methodology_label: `${draft.methodology_label} (cópia)` });
    } else if (p) {
      setDraft(fromPreset(p));
    } else {
      setDraft({
        id: null, is_default: false, methodology_label: "", persona: DEFAULT_PERSONA, extra_instructions: null,
        frameworks: { meddic: true, spin: true, talk_ratio: true },
        qualification_criteria: [{ key: "", label: "", description: "", max_score: 25 }],
        temperature_levels: PRESET_LEVELS.map((l) => ({ ...l })),
      });
    }
  };

  if (loading || !draft) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Carregando metodologias...</CardContent>
      </Card>
    );
  }

  const usedBy = draft.id ? usage[draft.id] ?? [] : [];

  return (
    <Card data-tour="cfg-metodologia">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5" />
          Metodologias de análise
        </CardTitle>
        <CardDescription>
          Critérios de qualificação, faixas de temperatura e regras que a IA aplica. Uma é a padrão; cada tipo de reunião pode usar outra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Biblioteca */}
        <div className="flex flex-wrap items-center gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDraft(toDraft(t))}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                draft.id === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
              )}
            >
              {t.is_default && <Star className="h-3.5 w-3.5 fill-current" aria-label="Padrão" />}
              {t.methodology_label}
            </button>
          ))}
          {!draft.id && (
            <span className="rounded-full border border-dashed border-primary px-3 py-1.5 text-sm text-primary">
              {draft.methodology_label || "Nova metodologia"} (não salva)
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova metodologia
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setSuggestion(null); setAiOpen(true); }} data-tour="cfg-metodologia-ia">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Sugerir com IA
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {draft.is_default ? (
            <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3 fill-current" /> Padrão da empresa</Badge>
          ) : draft.id ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={makeDefault} disabled={saving}>
              <Star className="mr-1 h-3.5 w-3.5" /> Tornar padrão
            </Button>
          ) : null}
          {usedBy.length > 0 && <span>Usada em: {usedBy.join(", ")}</span>}
          {!draft.is_default && draft.id && usedBy.length === 0 && (
            <span>Nenhum tipo de reunião usa esta metodologia. Escolha em Tipos de reunião.</span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meth-label">Nome da metodologia</Label>
            <Input id="meth-label" value={draft.methodology_label} onChange={(e) => patch({ methodology_label: e.target.value })} placeholder="BANT, SPICED, MEDDIC..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meth-persona">Persona da IA</Label>
            <Input id="meth-persona" value={draft.persona} onChange={(e) => patch({ persona: e.target.value })} placeholder={DEFAULT_PERSONA} />
          </div>
        </div>

        {/* Critérios */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Critérios de qualificação</Label>
              <p className={cn("text-xs", total === 100 ? "text-muted-foreground" : "text-warning")}>
                Soma dos pesos: {total}{total !== 100 && " (o ideal é 100)"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value="" onValueChange={applyPresetToDraft}>
                <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Usar critérios de um modelo" /></SelectTrigger>
                <SelectContent>
                  {METHODOLOGY_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm"
                onClick={() => patch({ qualification_criteria: [...draft.qualification_criteria, { key: "", label: "", max_score: 25 }] })}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {draft.qualification_criteria.map((criterion, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <Input aria-label="Rótulo do critério" value={criterion.label}
                  onChange={(e) => updateCriterion(index, { label: e.target.value })} placeholder="Ex: Budget" className="w-40" />
                <Input aria-label="Descrição do critério" value={criterion.description ?? ""}
                  onChange={(e) => updateCriterion(index, { description: e.target.value })} placeholder="O que a IA deve avaliar" className="min-w-[200px] flex-1" />
                <Input aria-label="Pontuação máxima" type="number" min={1} max={100} value={criterion.max_score ?? 25}
                  onChange={(e) => updateCriterion(index, { max_score: Number(e.target.value) })} className="w-20" />
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => patch({ qualification_criteria: draft.qualification_criteria.filter((_, i) => i !== index) })}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {draft.qualification_criteria.length === 0 && <p className="text-sm text-muted-foreground">Nenhum critério configurado.</p>}
          </div>
        </div>

        {/* Faixas de temperatura */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Faixas de temperatura</Label>
              <p className="text-xs text-muted-foreground">Da mais fria para a mais quente.</p>
            </div>
            <Button type="button" variant="outline" size="sm"
              onClick={() => patch({ temperature_levels: [...draft.temperature_levels, { key: "", label: "", criteria: "" }] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {draft.temperature_levels.map((level, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <Badge variant="secondary" className="shrink-0">{index + 1}</Badge>
                <Input aria-label="Rótulo da faixa" value={level.label}
                  onChange={(e) => updateLevel(index, { label: e.target.value })} placeholder="Ex: Quente" className="w-36" />
                <Input aria-label="Critério da faixa" value={level.criteria ?? ""}
                  onChange={(e) => updateLevel(index, { criteria: e.target.value })} placeholder="Quando a reunião entra nesta faixa" className="min-w-[220px] flex-1" />
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => patch({ temperature_levels: draft.temperature_levels.filter((_, i) => i !== index) })}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Análises extras */}
        <div className="space-y-2">
          <Label>Análises extras</Label>
          <p className="text-xs text-muted-foreground">Além da metodologia acima, a IA pode avaliar a reunião por estes frameworks.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <span>
                <span className="block text-sm font-medium">MEDDIC</span>
                <span className="block text-xs text-muted-foreground">Métricas, decisor, critérios, processo, dor e campeão</span>
              </span>
              <Switch checked={draft.frameworks.meddic !== false} onCheckedChange={(v) => patch({ frameworks: { ...draft.frameworks, meddic: v } })} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <span>
                <span className="block text-sm font-medium">SPIN</span>
                <span className="block text-xs text-muted-foreground">Situação, problema, implicação e necessidade</span>
              </span>
              <Switch checked={draft.frameworks.spin !== false} onCheckedChange={(v) => patch({ frameworks: { ...draft.frameworks, spin: v } })} />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="meth-extra">Regras específicas da operação</Label>
          <Textarea id="meth-extra" value={draft.extra_instructions ?? ""} onChange={(e) => patch({ extra_instructions: e.target.value })} rows={5}
            placeholder="Ex.: não usar prazo como critério de qualificação." />
          <p className="text-xs text-muted-foreground">Este texto entra no final do prompt de análise, como instrução obrigatória.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : draft.id ? "Salvar metodologia" : "Criar metodologia"}</Button>
          <div className="flex gap-2">
            {!draft.id && templates.length > 0 && (
              <Button variant="ghost" onClick={() => load()} disabled={saving}>Descartar</Button>
            )}
            {draft.id && !draft.is_default && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={saving}>
                <Trash2 className="mr-1 h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Nova metodologia */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova metodologia</DialogTitle>
            <DialogDescription>Comece por um modelo pronto e ajuste à sua operação, ou monte do zero.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {METHODOLOGY_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => startNew(p)}
                className="rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50">
                <div className="font-medium">{p.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{p.summary}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">{p.criteria.map((c) => c.label).join(" · ")}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => { setNewOpen(false); setSuggestion(null); setAiOpen(true); }}>
              <Sparkles className="mr-1 h-4 w-4" /> Sugerir com IA pela base de conhecimento
            </Button>
            <Button variant="outline" onClick={() => startNew(null)}><FilePlus2 className="mr-1 h-4 w-4" /> Em branco</Button>
            {draft.id && (
              <Button variant="outline" onClick={() => startNew(null, true)}><Copy className="mr-1 h-4 w-4" /> Copiar {draft.methodology_label}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sugestão pela IA */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Sugerir metodologia com IA</DialogTitle>
            <DialogDescription>
              A IA lê a base de conhecimento (documentos e produtos), os tipos de reunião e as últimas reuniões analisadas e propõe critérios, pesos, faixas e regras. Você revisa antes de salvar.
            </DialogDescription>
          </DialogHeader>
          {!suggestion ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-focus">Conte como vocês vendem (opcional)</Label>
                <Textarea id="ai-focus" rows={4} value={aiFocus} onChange={(e) => setAiFocus(e.target.value)}
                  placeholder="Ex.: vendemos ERP para distribuidoras; o decisor é o dono; a venda trava quando não falamos com o financeiro; ciclo de 30 a 60 dias." />
                <p className="text-xs text-muted-foreground">Quanto mais material na base de conhecimento, melhor a sugestão. Sem base, este texto é o ponto de partida.</p>
              </div>
              {typeOptions.length > 1 && (
                <div className="space-y-2">
                  <Label>Para qual tipo de reunião</Label>
                  <Select value={aiType} onValueChange={setAiType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas (metodologia geral)</SelectItem>
                      {typeOptions.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={askAi} disabled={aiBusy}>
                {aiBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lendo a base e montando a proposta…</> : <><Sparkles className="mr-2 h-4 w-4" /> Gerar sugestão</>}
              </Button>
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              <div>
                <p className="text-lg font-semibold">{suggestion.methodology_label}</p>
                {suggestion.rationale && <p className="mt-1 text-sm text-muted-foreground">{suggestion.rationale}</p>}
                {suggestion.sources.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Baseado em: {suggestion.sources.join(", ")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Critérios</Label>
                {suggestion.criteria.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <div><span className="font-medium">{c.label}</span>{c.description && <span className="text-muted-foreground"> · {c.description}</span>}</div>
                    <Badge variant="secondary">{c.max_score}</Badge>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Faixas de temperatura</Label>
                <ol className="space-y-1 text-sm">
                  {suggestion.temperature_levels.map((l, i) => (
                    <li key={l.key}><span className="font-medium">{i + 1}. {l.label}</span> <span className="text-muted-foreground">{l.criteria}</span></li>
                  ))}
                </ol>
              </div>
              {suggestion.extra_instructions && (
                <div className="space-y-1.5">
                  <Label>Regras da operação</Label>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{suggestion.extra_instructions}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button onClick={() => applySuggestion(true)}>Usar como nova metodologia</Button>
                {draft.id && <Button variant="outline" onClick={() => applySuggestion(false)}>Substituir {draft.methodology_label}</Button>}
                <Button variant="ghost" onClick={() => setSuggestion(null)} disabled={aiBusy}>Gerar outra</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
