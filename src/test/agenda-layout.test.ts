import { describe, expect, it } from "vitest";
import { agendaKind, hourRange, layoutDay, startOfWeek } from "@/lib/agendaLayout";
import type { AgendaItem } from "@/lib/calendar";

// Tela Minha agenda: semana de domingo a sábado, eventos que se sobrepõem
// dividem a coluna e cada evento tem o seu tipo (gravado, com cliente...).

const ev = (id: string, start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, title: id, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
  joinUrl: null, webLink: null, declined: false, attendees: [], lead: null, externo: true, meeting: null, ...extra,
});

describe("Minha agenda", () => {
  it("a semana começa no domingo", () => {
    const s = startOfWeek(new Date(2026, 9, 23, 15, 30)); // quinta, 23/10
    expect([s.getDate(), s.getDay(), s.getHours()]).toEqual([18, 0, 0]);
  });

  it("eventos sobrepostos dividem a largura; o que vem depois volta a ocupar tudo", () => {
    const dia = new Date(2026, 9, 23);
    const p = layoutDay([
      ev("a", "2026-10-23T09:00", "2026-10-23T10:00"),
      ev("b", "2026-10-23T09:30", "2026-10-23T10:30"),
      ev("c", "2026-10-23T11:00", "2026-10-23T11:30"),
      ev("outro-dia", "2026-10-24T09:00", "2026-10-24T10:00"),
    ], dia);
    const by = Object.fromEntries(p.map((x) => [x.ev.id, x]));
    expect(Object.keys(by).sort()).toEqual(["a", "b", "c"]);
    expect([by.a.col, by.a.cols, by.b.col, by.b.cols]).toEqual([0, 2, 1, 2]);
    expect([by.c.col, by.c.cols]).toEqual([0, 1]);
    expect([by.a.start, by.a.end]).toEqual([540, 600]);
  });

  it("evento curto ganha altura mínima e as horas abrem para caber eventos cedo ou tarde", () => {
    const p = layoutDay([ev("cedo", "2026-10-23T06:30", "2026-10-23T06:35"), ev("tarde", "2026-10-23T21:00", "2026-10-23T22:15")], new Date(2026, 9, 23));
    expect(p.find((x) => x.ev.id === "cedo")!.end - p.find((x) => x.ev.id === "cedo")!.start).toBe(20);
    expect(hourRange(p)).toEqual([6, 23]);
    expect(hourRange([])).toEqual([7, 20]);
  });

  it("tipo do evento: gravado, com cliente, não gravado ou interno", () => {
    const agora = new Date("2026-10-23T12:00");
    const meeting = { id: "m", title: "x", status: "completo", overall_score: 80, temperature: "quente" };
    expect(agendaKind(ev("g", "2026-10-23T09:00", "2026-10-23T10:00", { meeting }), agora)).toBe("gravada");
    expect(agendaKind(ev("p", "2026-10-23T09:00", "2026-10-23T10:00"), agora)).toBe("nao-gravada");
    expect(agendaKind(ev("f", "2026-10-23T14:00", "2026-10-23T15:00"), agora)).toBe("cliente");
    expect(agendaKind(ev("i", "2026-10-23T14:00", "2026-10-23T15:00", { externo: false }), agora)).toBe("interna");
  });
});
