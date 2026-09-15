import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { Brain, Plus, Trash2 } from "lucide-react";

/**
 * Metodologia de qualificação usada na análise das reuniões.
 *
 * É o que antes estava escrito dentro do prompt: critérios, faixas de
 * temperatura e regras próprias. Agora é dado da organização, e o backend monta
 * o prompt a partir daqui.
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

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

export const MethodologySettings = () => {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { refetch } = useOrgConfig();

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [methodologyLabel, setMethodologyLabel] = useState("BANT");
  const [persona, setPersona] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("analysis_templates")
        .select("*")
        .eq("is_default", true)
        .maybeSingle();

      if (data) {
        setTemplateId(data.id);
        setMethodologyLabel(data.methodology_label);
        setPersona(data.persona);
        setExtraInstructions(data.extra_instructions ?? "");
        setCriteria(Array.isArray(data.qualification_criteria)
          ? (data.qualification_criteria as unknown as Criterion[]) : []);
        setLevels(Array.isArray(data.temperature_levels)
          ? (data.temperature_levels as unknown as Level[]) : []);
      }
      setLoading(false);
    };
    load();
  }, []);

  const updateCriterion = (index: number, patch: Partial<Criterion>) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const updateLevel = (index: number, patch: Partial<Level>) => {
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        name: "Metodologia padrão",
        is_default: true,
        persona: persona || "Você é um especialista em vendas B2B.",
        methodology_key: slugify(methodologyLabel).toUpperCase() || "CUSTOM",
        methodology_label: methodologyLabel || "BANT",
        qualification_criteria: criteria.map((c) => ({
          ...c,
          key: c.key || slugify(c.label),
          max_score: Number(c.max_score) || 25,
        })),
        temperature_levels: levels.map((l) => ({ ...l, key: l.key || slugify(l.label) })),
        extra_instructions: extraInstructions || null,
      };

      const { error } = templateId
        ? await supabase.from("analysis_templates").update(payload).eq("id", templateId)
        : await supabase.from("analysis_templates").insert(payload);

      if (error) throw error;

      await refetch();
      toast({
        title: "Metodologia atualizada",
        description: "As próximas análises já usam estes critérios.",
      });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Carregando metodologia...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5" />
          Metodologia de análise
        </CardTitle>
        <CardDescription>
          Critérios de qualificação, faixas de temperatura e regras que a IA aplica nas reuniões desta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meth-label">Nome da metodologia</Label>
            <Input
              id="meth-label"
              value={methodologyLabel}
              onChange={(e) => setMethodologyLabel(e.target.value)}
              placeholder="BANT, MEDDIC, BAN..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meth-persona">Persona da IA</Label>
            <Input
              id="meth-persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Você é um especialista em vendas B2B."
            />
          </div>
        </div>

        {/* Critérios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Critérios de qualificação</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCriteria((prev) => [...prev, { key: "", label: "", max_score: 25 }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {criteria.map((criterion, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <Input
                  aria-label="Rótulo do critério"
                  value={criterion.label}
                  onChange={(e) => updateCriterion(index, { label: e.target.value })}
                  placeholder="Ex: Budget"
                  className="w-40"
                />
                <Input
                  aria-label="Descrição do critério"
                  value={criterion.description ?? ""}
                  onChange={(e) => updateCriterion(index, { description: e.target.value })}
                  placeholder="O que a IA deve avaliar"
                  className="min-w-[200px] flex-1"
                />
                <Input
                  aria-label="Pontuação máxima"
                  type="number"
                  min={1}
                  max={100}
                  value={criterion.max_score ?? 25}
                  onChange={(e) => updateCriterion(index, { max_score: Number(e.target.value) })}
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {criteria.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum critério configurado.</p>
            )}
          </div>
        </div>

        {/* Faixas de temperatura */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Faixas de temperatura</Label>
              <p className="text-xs text-muted-foreground">Da mais fria para a mais quente.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLevels((prev) => [...prev, { key: "", label: "", criteria: "" }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {levels.map((level, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <Badge variant="secondary" className="shrink-0">{index + 1}</Badge>
                <Input
                  aria-label="Rótulo da faixa"
                  value={level.label}
                  onChange={(e) => updateLevel(index, { label: e.target.value })}
                  placeholder="Ex: Quente"
                  className="w-36"
                />
                <Input
                  aria-label="Critério da faixa"
                  value={level.criteria ?? ""}
                  onChange={(e) => updateLevel(index, { criteria: e.target.value })}
                  placeholder="Quando a reunião entra nesta faixa"
                  className="min-w-[220px] flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLevels((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="meth-extra">Regras específicas da operação</Label>
          <Textarea
            id="meth-extra"
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            rows={5}
            placeholder="Ex.: não usar prazo como critério de qualificação."
          />
          <p className="text-xs text-muted-foreground">
            Este texto entra no final do prompt de análise, como instrução obrigatória.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar metodologia"}
        </Button>
      </CardContent>
    </Card>
  );
};
