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
