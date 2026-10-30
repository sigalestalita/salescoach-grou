import { assertEquals } from "jsr:@std/assert@1";
import { renderEmail } from "./novidades.ts";

Deno.test("novidades: imagem embaixo do texto e quebras de linha no e-mail", () => {
  const m = renderEmail({
    novidades: [{ id: "1", title: "Robô na agenda", body: "linha 1\nlinha 2", cta_label: null, cta_path: null, audience: ["vendedor"], image_url: "https://app.test/novidades/robo.jpg" }],
    marca: { product_name: "Sales Coach", logo_url: null, primary_hsl: null, support_email: null },
    appUrl: "https://app.test", unsubscribeUrl: "https://app.test/sair", firstName: "Ana",
  });
  assertEquals(m.html.includes("linha 1<br>linha 2"), true);
  assertEquals(m.html.includes('<img src="https://app.test/novidades/robo.jpg"'), true);
});

Deno.test("novidades: marca padrão sai com banner e rodapé da NEXA; marca própria, não", () => {
  const base = {
    novidades: [{ id: "1", title: "Robô na agenda", body: "texto", cta_label: "Abrir", cta_path: "/", audience: ["vendedor"] }],
    appUrl: "https://app.test", unsubscribeUrl: "https://app.test/sair", firstName: "Ana",
  };
  const nexa = renderEmail({ ...base, marca: { product_name: "Sales Coach", logo_url: null, primary_hsl: null, support_email: null } });
  assertEquals(nexa.html.includes('src="https://app.test/novidades/email/banner.jpg"'), true);
  assertEquals(nexa.html.includes("um produto NEXA"), true);
  assertEquals(nexa.html.includes("Novidade 01"), true);
  const propria = renderEmail({ ...base, marca: { product_name: "Vendas Pro", logo_url: "https://x.test/logo.png", primary_hsl: null, support_email: null } });
  assertEquals(propria.html.includes("banner.jpg"), false);
  assertEquals(propria.html.includes("NEXA"), false);
});
