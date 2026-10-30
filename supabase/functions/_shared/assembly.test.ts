import { assert, assertFalse } from "jsr:@std/assert@1";
import { falhaDeConta } from "./assembly.ts";

Deno.test("falhaDeConta: saldo negativo, chave inválida e 402 são da conta", () => {
  assert(falhaDeConta(400, '{"error":"Your current account balance is negative. Please top up to continue using the API."}'));
  assert(falhaDeConta(401, '{"error":"Invalid API key"}'));
  assert(falhaDeConta(402, ""));
});

Deno.test("falhaDeConta: erro do arquivo não é da conta", () => {
  assertFalse(falhaDeConta(400, '{"error":"Transcoding failed. File does not appear to contain audio."}'));
  assertFalse(falhaDeConta(500, "Internal Server Error"));
});
