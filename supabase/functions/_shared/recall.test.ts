import { assertEquals } from "jsr:@std/assert@1";
import { avisoValido, motivoDaSaida, plataformaDe, tempoDoRobo } from "./recall.ts";

const segredo = "whsec_" + btoa("chave-de-teste-com-32-bytes-ok!!");
async function assinar(id: string, ts: string, corpo: string) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode("chave-de-teste-com-32-bytes-ok!!"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${id}.${ts}.${corpo}`)));
  return "v1," + btoa(String.fromCharCode(...sig));
}
const pedido = (h: Record<string, string>) => new Request("https://x/", { method: "POST", headers: h });

Deno.test("aviso da Recall: assinatura válida, nos cabeçalhos novos e nos antigos", async () => {
  Deno.env.set("RECALL_WEBHOOK_SECRET", segredo);
  const ts = String(Math.floor(Date.now() / 1000)), corpo = '{"event":"bot.done"}';
  const sig = await assinar("msg_1", ts, corpo);
  assertEquals(await avisoValido(pedido({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": "v1,AAAA " + sig }), corpo), true);
  assertEquals(await avisoValido(pedido({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": sig }), corpo), true);
});

Deno.test("aviso da Recall: recusa corpo alterado, horário velho e segredo ausente", async () => {
  Deno.env.set("RECALL_WEBHOOK_SECRET", segredo);
  const ts = String(Math.floor(Date.now() / 1000)), corpo = '{"event":"bot.done"}';
  const sig = await assinar("msg_1", ts, corpo);
  assertEquals(await avisoValido(pedido({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sig }), corpo + " "), false);
  const velho = String(Math.floor(Date.now() / 1000) - 3600);
  assertEquals(await avisoValido(pedido({ "webhook-id": "msg_1", "webhook-timestamp": velho, "webhook-signature": await assinar("msg_1", velho, corpo) }), corpo), false);
  Deno.env.delete("RECALL_WEBHOOK_SECRET");
  assertEquals(await avisoValido(pedido({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sig }), corpo), false);
});

Deno.test("plataformas atendidas pelo robô", () => {
  assertEquals(plataformaDe("https://meet.google.com/abc-defg-hij"), "meet");
  assertEquals(plataformaDe("https://teams.microsoft.com/l/meetup-join/xyz"), "teams");
  assertEquals(plataformaDe("https://us02web.zoom.us/j/123"), "zoom");
  assertEquals(plataformaDe("https://exemplo.com/reuniao"), null);
});

Deno.test("motivo da saída do robô", () => {
  assertEquals(motivoDaSaida("timeout_exceeded_waiting_room")?.includes("sala de espera"), true);
  assertEquals(motivoDaSaida("call_ended_by_host"), null);
  assertEquals(motivoDaSaida(undefined), null);
});

Deno.test("tempo do robô: de joining_call até done, ou a gravação", () => {
  const bot = {
    status_changes: [
      { code: "joining_call", created_at: "2026-11-20T14:00:00Z" },
      { code: "in_waiting_room", created_at: "2026-11-20T14:01:00Z" },
      { code: "in_call_recording", created_at: "2026-11-20T14:05:00Z" },
      { code: "call_ended", created_at: "2026-11-20T14:45:00Z" },
      { code: "done", created_at: "2026-11-20T14:46:30Z" },
    ],
  };
  assertEquals(tempoDoRobo(bot), 46 * 60 + 30);
  // Ainda sem done: conta até agora.
  assertEquals(tempoDoRobo({ status_changes: bot.status_changes.slice(0, 2) }, Date.parse("2026-11-20T14:10:00Z")), 600);
  assertEquals(tempoDoRobo({ recordings: [{ started_at: "2026-11-20T14:05:00Z", completed_at: "2026-11-20T14:35:00Z" }] }), 1800);
  assertEquals(tempoDoRobo({}), null);
});
