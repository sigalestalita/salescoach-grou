import type { AgendaItem } from "@/lib/calendar";

/**
 * Contas da tela Início: pendências automáticas, o ritmo da pessoa e os
 * insights do time para admin e gestor. Tudo a partir das reuniões gravadas e
 * das análises; a agenda entra só nas contas da própria pessoa.
 */

export const DAY = 86_400_000;

export interface InicioMeeting {
  id: string;
  title: string;
  status: string;
  overall_score: number | null;
  temperature: string | null;
  created_at: string;
  updated_at: string;
  seller_id: string;
}

export interface InicioAnalysis {
  meeting_id: string;
  bant_score: Record<string, unknown> | null;
  methodology: { mode?: string; criteria?: { key: string; label: string; max_score?: number }[] } | null;
  created_at: string;
}

const PROCESSING = new Set(["enviado", "baixando", "transcrevendo", "analisando"]);
const STALL_MS = 30 * 60_000;

/** Reunião com erro, ou parada no processamento há mais de 30 minutos. */
export function needsRetry(m: Pick<InicioMeeting, "status" | "updated_at">, now: Date): boolean {
  if (m.status === "erro") return true;
  return PROCESSING.has(m.status) && now.getTime() - new Date(m.updated_at).getTime() > STALL_MS;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);

export function scoresBetween(ms: InicioMeeting[], from: number, to: number): number[] {
  return ms
    .filter((m) => m.status === "completo" && m.overall_score != null)
    .filter((m) => { const t = new Date(m.created_at).getTime(); return t >= from && t < to; })
    .map((m) => Number(m.overall_score));
}

export interface Ritmo {
  media30: number | null;
  mediaAnterior: number | null;
  /** Diferença para os 30 dias anteriores; null sem dados nos dois períodos. */
  tendencia: number | null;
  gravadasSemana: number;
  analisadas30: number;
}

export function ritmo(ms: InicioMeeting[], now: Date, weekStart: Date): Ritmo {
  const t = now.getTime();
  const atual = scoresBetween(ms, t - 30 * DAY, t + 1);
  const antes = scoresBetween(ms, t - 60 * DAY, t - 30 * DAY);
  const media30 = avg(atual);
  const mediaAnterior = avg(antes);
  return {
    media30,
    mediaAnterior,
    tendencia: media30 != null && mediaAnterior != null ? media30 - mediaAnterior : null,
    gravadasSemana: ms.filter((m) => new Date(m.created_at) >= weekStart).length,
    analisadas30: atual.length,
  };
}

/** Reuniões com cliente da semana que já passaram sem gravação (convites recusados não contam). */
export function semGravacao(events: AgendaItem[], now: Date, desde: Date): AgendaItem[] {
  return events
    .filter((e) => e.externo && !e.meeting && !e.declined)
    .filter((e) => new Date(e.end) < now && new Date(e.start) >= desde)
    .sort((a, b) => b.start.localeCompare(a.start));
}

// ── Time ──

export interface VendedorResumo {
  id: string;
  nome: string;
  semana: number;
  media30: number | null;
  tendencia: number | null;
  ultima: string | null;
}

export function porVendedor(
  ms: InicioMeeting[],
  pessoas: { id: string; nome: string }[],
  now: Date,
  weekStart: Date,
): VendedorResumo[] {
  const t = now.getTime();
  return pessoas
    .map((p) => {
      const deles = ms.filter((m) => m.seller_id === p.id);
      const atual = scoresBetween(deles, t - 30 * DAY, t + 1);
      const antes = scoresBetween(deles, t - 60 * DAY, t - 30 * DAY);
      const m30 = avg(atual);
      const mAnt = avg(antes);
      const ultima = deles.reduce<string | null>((u, m) => (!u || m.created_at > u ? m.created_at : u), null);
      return {
        id: p.id,
        nome: p.nome,
        semana: deles.filter((m) => new Date(m.created_at) >= weekStart).length,
        media30: m30,
        // Tendência só com pelo menos 2 reuniões em cada período.
        tendencia: atual.length >= 2 && antes.length >= 2 && m30 != null && mAnt != null ? m30 - mAnt : null,
        ultima,
      };
    })
    .sort((a, b) => b.semana - a.semana || (b.media30 ?? -1) - (a.media30 ?? -1) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type Alerta =
  | { tipo: "queda"; vendedor: VendedorResumo }
  | { tipo: "parado"; vendedor: VendedorResumo; dias: number | null };

export const QUEDA_PONTOS = 8;
export const PARADO_DIAS = 7;

/** Quem está com o score caindo e quem não grava há uma semana (ou nunca gravou). */
export function alertasDoTime(vs: VendedorResumo[], vendedores: Set<string>, now: Date): Alerta[] {
  const out: Alerta[] = [];
  for (const v of vs) {
    if (v.tendencia != null && v.tendencia <= -QUEDA_PONTOS) out.push({ tipo: "queda", vendedor: v });
  }
  for (const v of vs) {
    if (!vendedores.has(v.id)) continue;
    const dias = v.ultima ? Math.floor((now.getTime() - new Date(v.ultima).getTime()) / DAY) : null;
    if (dias == null || dias >= PARADO_DIAS) out.push({ tipo: "parado", vendedor: v, dias });
  }
  return out;
}

export interface CriterioMedia {
  label: string;
  pct: number;
  n: number;
}

/** Média de cada critério da metodologia (0 a 100), do mais fraco para o mais forte. Conversas de playbook ficam fora. */
export function criteriosDoTime(
  analyses: InicioAnalysis[],
  fallback: { key: string; label: string }[],
  fallbackMax: number,
): CriterioMedia[] {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of analyses) {
    if (a.methodology?.mode === "playbook" || !a.bant_score) continue;
    const crit = a.methodology?.criteria?.length ? a.methodology.criteria : fallback.map((c) => ({ ...c, max_score: fallbackMax }));
    for (const c of crit) {
      const raw = a.bant_score[c.key];
      const v = typeof raw === "number" ? raw : raw && typeof raw === "object" && "score" in raw ? Number((raw as { score: unknown }).score) : NaN;
      if (!isFinite(v)) continue;
      const max = c.max_score && c.max_score > 0 ? c.max_score : 25;
      const cur = acc.get(c.label) ?? { sum: 0, n: 0 };
      cur.sum += Math.max(0, Math.min(100, (v / max) * 100));
      cur.n++;
      acc.set(c.label, cur);
    }
  }
  return [...acc.entries()]
    .map(([label, x]) => ({ label, pct: Math.round(x.sum / x.n), n: x.n }))
    .sort((a, b) => a.pct - b.pct);
}

export function saudacao(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** Item do dia numa lista: muda todo dia e é o mesmo para a pessoa durante o dia. */
export function doDia<T>(lista: T[], now: Date): T | undefined {
  if (!lista.length) return undefined;
  const n = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / DAY);
  return lista[((n % lista.length) + lista.length) % lista.length];
}
