import { assertEquals } from "jsr:@std/assert@1";
import { avisoValido, plataformaDe } from "./recall.ts";

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
