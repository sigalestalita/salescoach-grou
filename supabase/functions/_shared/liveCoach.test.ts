import { assertEquals } from "jsr:@std/assert@1";
import { dicaRepetida, vaiChamarIa } from "./liveCoach.ts";

Deno.test("coach: a mesma pergunta com outras palavras conta como repetida", () => {
  const recentes = [{ acao: "Qual o orçamento que vocês têm reservado para esse projeto?" }];
  assertEquals(dicaRepetida({ acao: "Vocês já têm um orçamento reservado para isso?" }, recentes), true);
  assertEquals(dicaRepetida({ acao: "E quanto vocês reservaram de orçamento para o projeto este ano?" }, recentes), true);
});

Deno.test("coach: pergunta diferente passa", () => {
  const recentes = [{ acao: "Qual o orçamento que vocês têm reservado para esse projeto?" }, { acao: null }];
  assertEquals(dicaRepetida({ acao: "Quem mais participa da decisão de compra aí na empresa?" }, recentes), false);
  assertEquals(dicaRepetida({ acao: "Qual o prazo de implantação que vocês imaginam?" }, [{ acao: "Qual o prazo do contrato atual de vocês?" }]), false);
  assertEquals(dicaRepetida({ acao: "Perfeito." }, recentes), false);
});

Deno.test("coach: depois da fala do vendedor, espera a dica ficar um tempo na tela", () => {
  const agora = new Date("2026-11-10T12:00:00Z");
  const ha = (s: number) => new Date(agora.getTime() - s * 1000).toISOString();
  assertEquals(vaiChamarIa("vendedor", ha(10), agora), false);
  assertEquals(vaiChamarIa("vendedor", ha(30), agora), true);
  assertEquals(vaiChamarIa("cliente", ha(5), agora), true);
  assertEquals(vaiChamarIa("vendedor", null, agora), true);
  assertEquals(vaiChamarIa(undefined, ha(5), agora), true); // chamadas antigas, sem gatilho
});
