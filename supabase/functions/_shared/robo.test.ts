import { assertEquals } from "jsr:@std/assert@1";
import { EventoAgenda, planejar, RoboExistente } from "./robo.ts";

const agora = new Date("2026-11-03T12:00:00Z");
const fim = new Date("2026-11-04T12:00:00Z");
const ev = (id: string, h: number, extra: Partial<EventoAgenda> = {}): EventoAgenda => ({
  id, title: id, start: new Date(agora.getTime() + h * 3600_000).toISOString(),
  end: new Date(agora.getTime() + (h + 1) * 3600_000).toISOString(),
  joinUrl: "https://meet.google.com/abc-defg-hij", declined: false, externo: true, gravada: false, ...extra,
});
const robo = (calendar_event_id: string, start_at: string, extra: Partial<RoboExistente> = {}): RoboExistente => ({
  id: "r-" + calendar_event_id, calendar_event_id, start_at, meeting_url: "https://meet.google.com/abc-defg-hij",
  status: "agendado", automatico: true, provider_bot_id: "bot", ...extra,
});
const tipos = (a: { tipo: string; ev?: { id: string }; robo?: { calendar_event_id: string | null } }[]) =>
  a.map((x) => `${x.tipo}:${x.ev?.id ?? x.robo?.calendar_event_id}`);

Deno.test("robô automático: cada modo escolhe as reuniões certas", () => {
  const eventos = [
    ev("cliente", 2), ev("interna", 3, { externo: false }), ev("sem-link", 4, { joinUrl: null }),
    ev("recusada", 5, { declined: true }), ev("outra-plataforma", 6, { joinUrl: "https://whereby.com/x" }),
    ev("ja-gravada", -0.1, { gravada: true }), ev("comecou-agora", -0.2), ev("comecou-ha-1h", -1),
  ];
  assertEquals(tipos(planejar(eventos, [], "desligado", agora, fim)), []);
  assertEquals(tipos(planejar(eventos, [], "clientes", agora, fim)), ["criar:cliente", "criar:comecou-agora"]);
  assertEquals(tipos(planejar(eventos, [], "todas", agora, fim)), ["criar:cliente", "criar:interna", "criar:comecou-agora"]);
});

Deno.test("robô automático: respeita a exceção do vendedor e não duplica", () => {
  const eventos = [ev("a", 2), ev("b", 3), ev("c", 4)];
  const robos = [
    robo("a", eventos[0].start, { status: "cancelado" }), // "não gravar esta reunião"
    robo("b", eventos[1].start), // já agendado no mesmo horário
    robo("c", eventos[2].start, { status: "erro" }),
  ];
  assertEquals(tipos(planejar(eventos, robos, "todas", agora, fim)), []);
});

Deno.test("robô automático: remarca, tira e devolve conforme a agenda muda", () => {
  const eventos = [ev("mudou-hora", 5), ev("virou-interna", 3, { externo: false }), ev("recusou", 4, { declined: true })];
  const robos = [
    robo("mudou-hora", eventos[0].start.replace("17:00", "16:00")),
    robo("virou-interna", eventos[1].start),
    robo("recusou", eventos[2].start, { automatico: false }),
    robo("sumiu", new Date(agora.getTime() + 6 * 3600_000).toISOString()),
    robo("fora-da-janela", new Date(agora.getTime() + 30 * 3600_000).toISOString()),
  ];
  assertEquals(tipos(planejar(eventos, robos, "clientes", agora, fim)), [
    "remarcar:mudou-hora", "tirar:virou-interna", "tirar:recusou", "tirar:sumiu",
  ]);
  // Desligar tira os automáticos, mas o robô que o vendedor mandou fica.
  const enviado = robo("mudou-hora", eventos[0].start, { automatico: false });
  assertEquals(tipos(planejar([eventos[0]], [enviado], "desligado", agora, fim)), []);
  assertEquals(tipos(planejar([eventos[0]], [robo("mudou-hora", eventos[0].start)], "desligado", agora, fim)), ["tirar:mudou-hora"]);
});
