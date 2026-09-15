import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Configuração de negócio da organização: tipos de reunião, metodologia de
 * qualificação e faixas de temperatura.
 *
 * Substitui as listas que estavam fixas nos componentes. Enquanto a consulta
 * não volta, os padrões neutros abaixo mantêm a interface utilizável.
 */

export interface QualificationCriterion {
  key: string;
  label: string;
  description?: string;
  max_score?: number;
}

export interface TemperatureLevel {
  key: string;
  label: string;
  criteria?: string;
}

export interface MeetingType {
  id: string;
  key: string;
  label: string;
  sort_order: number;
}

export interface OrgConfig {
  meetingTypes: MeetingType[];
  methodologyLabel: string;
  criteria: QualificationCriterion[];
  temperatureLevels: TemperatureLevel[];
  maxCriterionScore: number;
}

const DEFAULT_CRITERIA: QualificationCriterion[] = [
  { key: "budget", label: "Budget", max_score: 25 },
  { key: "authority", label: "Authority", max_score: 25 },
  { key: "need", label: "Need", max_score: 25 },
  { key: "timeline", label: "Timeline", max_score: 25 },
];

const DEFAULT_LEVELS: TemperatureLevel[] = [
  { key: "congelado", label: "Congelado" },
  { key: "frio", label: "Frio" },
  { key: "morno", label: "Morno" },
  { key: "quente", label: "Quente" },
  { key: "muito_quente", label: "Muito quente" },
];

export const FALLBACK_CONFIG: OrgConfig = {
  meetingTypes: [],
  methodologyLabel: "BANT",
  criteria: DEFAULT_CRITERIA,
  temperatureLevels: DEFAULT_LEVELS,
  maxCriterionScore: 25,
};

/** Ícone por faixa de temperatura, do mais frio para o mais quente. */
export function temperatureIcon(index: number, total: number): string {
  if (total <= 1) return "🔥";
  const scale = ["🧊", "❄️", "🌤️", "🔥", "🔥🔥"];
  const position = Math.round((index / (total - 1)) * (scale.length - 1));
  return scale[position];
}

export function useOrgConfig() {
  const query = useQuery<OrgConfig>({
    queryKey: ["org-config"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [typesRes, templateRes] = await Promise.all([
        supabase
          .from("meeting_types")
          .select("id, key, label, sort_order")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("analysis_templates")
          .select("methodology_label, qualification_criteria, temperature_levels")
          .eq("is_default", true)
          .maybeSingle(),
      ]);

      const criteria = Array.isArray(templateRes.data?.qualification_criteria)
        ? (templateRes.data!.qualification_criteria as unknown as QualificationCriterion[])
        : DEFAULT_CRITERIA;

      const levels = Array.isArray(templateRes.data?.temperature_levels)
        ? (templateRes.data!.temperature_levels as unknown as TemperatureLevel[])
        : DEFAULT_LEVELS;

      return {
        meetingTypes: (typesRes.data ?? []) as MeetingType[],
        methodologyLabel: templateRes.data?.methodology_label || "BANT",
        criteria: criteria.length ? criteria : DEFAULT_CRITERIA,
        temperatureLevels: levels.length ? levels : DEFAULT_LEVELS,
        maxCriterionScore: Math.max(...(criteria.length ? criteria : DEFAULT_CRITERIA).map((c) => c.max_score ?? 25)),
      };
    },
  });

  return {
    config: query.data ?? FALLBACK_CONFIG,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** Mapa key → rótulo com ícone, para listas e badges de temperatura. */
export function temperatureLabels(levels: TemperatureLevel[]): Record<string, string> {
  return levels.reduce<Record<string, string>>((acc, level, index) => {
    acc[level.key] = `${temperatureIcon(index, levels.length)} ${level.label}`;
    return acc;
  }, {});
}
