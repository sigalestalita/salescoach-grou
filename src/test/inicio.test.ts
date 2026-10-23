import { describe, expect, it } from "vitest";
import { alertasDoTime, criteriosDoTime, doDia, needsRetry, porVendedor, ritmo, semGravacao, type InicioMeeting } from "@/lib/inicio";
import type { AgendaItem } from "@/lib/calendar";

// Tela Início: pendências automáticas, ritmo da pessoa e insights do time.

const agora = new Date("2026-10-23T15:00:00");
const diasAtras = (d: number, h = 10) => { const x = new Date(agora); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const m = (id: string, seller: string, d: number, score: number | null, status = "completo", extra: Partial<InicioMeeting> = {}): InicioMeeting => ({
  id, title: id, status, overall_score: score, temperature: null, created_at: diasAtras(d), updated_at: diasAtras(d), seller_id: seller, ...extra,
});
const ev = (id: string, d: number, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, title: id, start: diasAtras(d, 14), end: diasAtras(d, 15), joinUrl: null, webLink: null, declined: false,
  attendees: [], lead: null, externo: true, meeting: null, ...extra,
});

describe("Início", () => {
  it("pendência de análise: erro, ou parada há mais de 30 minutos", () => {
    expect(needsRetry({ status: "erro", updated_at: agora.toISOString() }, agora)).toBe(true);
    expect(needsRetry({ status: "analisando", updated_at: new Date(agora.getTime() - 40 * 60_000).toISOString() }, agora)).toBe(true);
    expect(needsRetry({ status: "analisando", updated_at: new Date(agora.getTime() - 5 * 60_000).toISOString() }, agora)).toBe(false);
    expect(needsRetry({ status: "completo", updated_at: diasAtras(9) }, agora)).toBe(false);
  });

  it("reunião com cliente sem gravação: só as que passaram, com cliente, não gravadas e não recusadas", () => {
    const desde = new Date(agora.getTime() - 7 * 86_400_000);
    const r = semGravacao([
      ev("passou", 1), ev("gravada", 1, { meeting: { id: "x", title: "x", status: "completo", overall_score: 80, temperature: null } }),
      ev("interna", 1, { externo: false }), ev("recusada", 1, { declined: true }), ev("futura", -1), ev("antiga", 10),
    ], agora, desde);
    expect(r.map((e) => e.id)).toEqual(["passou"]);
  });

  it("ritmo: média de 30 dias, tendência e gravadas na semana", () => {
    const semana = new Date("2026-10-18T00:00:00");
    const r = ritmo([m("a", "u", 2, 80), m("b", "u", 10, 70), m("c", "u", 40, 60), m("d", "u", 1, null, "erro")], agora, semana);
    expect(r).toEqual({ media30: 75, mediaAnterior: 60, tendencia: 15, gravadasSemana: 2, analisadas30: 2 });
  });

  it("time: queda de score e vendedor parado ou que nunca gravou", () => {
    const semana = new Date("2026-10-18T00:00:00");
    const ms = [m("1", "ana", 3, 50), m("2", "ana", 5, 54), m("3", "ana", 35, 70), m("4", "ana", 40, 66), m("5", "rui", 12, 80)];
    const vs = porVendedor(ms, [{ id: "ana", nome: "Ana" }, { id: "rui", nome: "Rui" }, { id: "bia", nome: "Bia" }, { id: "eu", nome: "Você" }], agora, semana);
    expect(vs.find((v) => v.id === "ana")).toMatchObject({ semana: 2, media30: 52, tendencia: -16 });
    const al = alertasDoTime(vs, new Set(["ana", "rui", "bia"]), agora);
    expect(al.map((a) => `${a.tipo}:${a.vendedor.id}`).sort()).toEqual(["parado:bia", "parado:rui", "queda:ana"]);
    expect(al.find((a) => a.vendedor.id === "bia")).toMatchObject({ dias: null });
    expect(al.some((a) => a.vendedor.id === "eu")).toBe(false);
  });

  it("critério mais fraco do time, sem as conversas de playbook", () => {
    const c = criteriosDoTime([
      { meeting_id: "1", bant_score: { budget: 5, need: 20 }, methodology: null, created_at: "" },
      { meeting_id: "2", bant_score: { budget: { score: 10 }, need: 25 }, methodology: null, created_at: "" },
      { meeting_id: "3", bant_score: { budget: 0 }, methodology: { mode: "playbook" }, created_at: "" },
    ], [{ key: "budget", label: "Orçamento" }, { key: "need", label: "Necessidade" }], 25);
    expect(c[0]).toEqual({ label: "Orçamento", pct: 30, n: 2 });
  });

  it("\"Você sabia?\" muda todo dia e repete no mesmo dia", () => {
    const l = ["a", "b", "c"];
    const d1 = doDia(l, new Date("2026-10-23T08:00:00"));
    expect(doDia(l, new Date("2026-10-23T22:00:00"))).toBe(d1);
    expect(doDia(l, new Date("2026-10-24T08:00:00"))).not.toBe(d1);
  });
});
