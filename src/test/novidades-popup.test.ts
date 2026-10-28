import { describe, expect, it } from "vitest";
import { NovidadePublicada, novidadesParaMostrar } from "@/lib/novidadesPopup";

const agora = new Date("2026-11-10T12:00:00Z");
const n = (id: string, dias: number): NovidadePublicada => ({
  id, title: id, body: "", cta_label: null, cta_path: null,
  published_at: new Date(agora.getTime() - dias * 86_400_000).toISOString(),
});

describe("janela O que há de novo", () => {
  it("mostra as não vistas dos últimos 30 dias, da mais nova, no máximo três", () => {
    const pub = [n("a", 1), n("b", 5), n("c", 10), n("d", 20), n("velha", 40)];
    expect(novidadesParaMostrar(pub, new Set(["b"]), "2026-01-01T00:00:00Z", agora).map((x) => x.id)).toEqual(["a", "c", "d"]);
  });

  it("quem entrou depois da publicação não recebe a novidade", () => {
    const pub = [n("antes", 6), n("depois", 2)];
    const entrou = new Date(agora.getTime() - 4 * 86_400_000).toISOString();
    expect(novidadesParaMostrar(pub, new Set(), entrou, agora).map((x) => x.id)).toEqual(["depois"]);
  });

  it("tudo visto: nada a mostrar", () => {
    expect(novidadesParaMostrar([n("a", 1)], new Set(["a"]), null, agora)).toEqual([]);
  });
});
