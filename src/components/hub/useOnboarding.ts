import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { extensionStatus } from "@/lib/extensionBridge";
import { JOURNEY, JourneyDef } from "./content";

/**
 * Jornada de primeiros passos. Cada etapa sabe se está concluída olhando os
 * próprios dados (documento enviado, CRM conectado, primeira reunião
 * analisada...). As que não dá para deduzir, a pessoa marca à mão; isso, mais
 * "já viu as boas-vindas" e "já fez o tour", fica em user_onboarding.
 */

export interface JourneyStep extends JourneyDef {
  done: boolean;
  manualDone: boolean;
}

type Signals = Record<string, boolean>;

async function count(q: PromiseLike<{ count: number | null }>): Promise<number> {
  try { return (await q).count ?? 0; } catch { return 0; }
}

async function loadSignals(userId: string): Promise<Signals> {
  const head = { count: "exact" as const, head: true };
  const [docs, members, crm, calendar, myMeetings, analysed, trainings, ext] = await Promise.all([
    count(supabase.from("knowledge_documents").select("id", head)),
    count(supabase.from("user_roles").select("user_id", head)),
    count(supabase.from("crm_connections").select("id", head).eq("status", "ativo")),
    count(supabase.from("calendar_accounts").select("id", head).eq("user_id", userId).eq("status", "conectado")),
    count(supabase.from("meetings").select("id", head).eq("seller_id", userId)),
    count(supabase.from("meetings").select("id", head).eq("status", "completo")),
    count(supabase.from("roleplay_sessions").select("id", head).eq("user_id", userId).eq("status", "concluida")),
    extensionStatus().then((s) => (s?.installed ? 1 : 0)).catch(() => 0),
  ]);
  return {
    conhecimento: docs > 0,
    equipe: members > 1,
    crm: crm > 0,
    agenda: calendar > 0,
    "primeira-reuniao": myMeetings > 0,
    analise: analysed > 0,
    treino: trainings > 0,
    extensao: ext > 0,
  };
}

export function useOnboarding() {
  const { user, role, orgId, support } = useAuth();
  const userId = user?.id ?? null;
  const [row, setRow] = useState<{ completed_steps: string[]; welcome_seen_at: string | null; tour_done_at: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || !orgId) return;
    let alive = true;
    supabase.from("user_onboarding").select("completed_steps, welcome_seen_at, tour_done_at").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setRow(data ?? { completed_steps: [], welcome_seen_at: null, tour_done_at: null });
        setLoaded(true);
      });
    return () => { alive = false; };
  }, [userId, orgId]);

  const signals = useQuery({
    queryKey: ["onboarding-signals", userId, orgId],
    enabled: !!userId && !!orgId,
    queryFn: () => loadSignals(userId!),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Grava a linha da pessoa (no modo suporte nada é gravado: é só leitura).
  const save = useCallback(async (patch: Partial<NonNullable<typeof row>>) => {
    setRow((r) => ({ ...(r ?? { completed_steps: [], welcome_seen_at: null, tour_done_at: null }), ...patch }));
    if (!userId || support) return;
    await supabase.from("user_onboarding").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  }, [userId, support]);

  const markWelcomeSeen = useCallback(() => save({ welcome_seen_at: new Date().toISOString() }), [save]);
  const markTourDone = useCallback(() => save({ tour_done_at: new Date().toISOString() }), [save]);
  const completed = row?.completed_steps;
  const setManualDone = useCallback((id: string, done: boolean) => {
    const current = completed ?? [];
    save({ completed_steps: done ? [...new Set([...current, id])] : current.filter((s) => s !== id) });
  }, [completed, save]);

  const steps: JourneyStep[] = useMemo(() => {
    const s = signals.data ?? {};
    return JOURNEY
      .filter((d) => role && d.roles.includes(role))
      .map((d) => {
        const manualDone = (completed ?? []).includes(d.id);
        return { ...d, manualDone, done: d.auto ? !!s[d.id] || manualDone : manualDone };
      });
  }, [signals.data, completed, role]);

  const progress = steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0;

  return {
    loaded: loaded && !signals.isLoading,
    steps,
    progress,
    welcomeSeen: !!row?.welcome_seen_at,
    tourDone: !!row?.tour_done_at,
    markWelcomeSeen,
    markTourDone,
    setManualDone,
  };
}
