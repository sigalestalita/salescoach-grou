import { assertEquals } from "jsr:@std/assert@1";
import { copiarVideo, CopiaRow, DepsCopia, metadadosTus, PARTE, proximaParte, RepoCopia, tamanhoDoIntervalo } from "./copiaVideo.ts";

Deno.test("cópia do vídeo: tamanho, partes e metadados", () => {
  assertEquals(tamanhoDoIntervalo("bytes 0-0/15728640"), 15728640);
  assertEquals(tamanhoDoIntervalo(null), null);
  assertEquals(proximaParte(0, 10), [0, 9]);
  assertEquals(proximaParte(PARTE, PARTE * 2 + 5), [PARTE, PARTE * 2 - 1]);
  assertEquals(metadadosTus("u/robo-m.mp4", "video/mp4").split(",")[1], `objectName ${btoa("u/robo-m.mp4")}`);
});

/** Recall (vídeo com Range) e Storage (TUS) de mentira, num fetch só. */
function mundo(tamanho: number, opcoes: { limiteStorage?: number } = {}) {
  const video = new Uint8Array(tamanho).map((_, i) => (i * 31 + 7) % 251);
  const uploads = new Map<string, { total: number; dados: Uint8Array; offset: number }>();
  let n = 0;
  const chamadas: string[] = [];
  const f = (async (entrada: string | URL | Request, init: RequestInit = {}) => {
    const url = String(entrada);
    const h = new Headers(init.headers);
    const metodo = init.method ?? "GET";
    chamadas.push(`${metodo} ${url.replace(/\?.*/, "")}`);
    if (url.startsWith("https://recall.test/video")) {
      const m = h.get("Range")?.match(/bytes=(\d+)-(\d+)/);
      if (!m) return new Response(video, { status: 200 });
      const de = Number(m[1]), ate = Math.min(Number(m[2]), tamanho - 1);
      return new Response(video.slice(de, ate + 1), { status: 206, headers: { "Content-Range": `bytes ${de}-${ate}/${tamanho}` } });
    }
    if (url === "https://sb.test/storage/v1/upload/resumable" && metodo === "POST") {
      const total = Number(h.get("Upload-Length"));
      if (opcoes.limiteStorage && total > opcoes.limiteStorage) return new Response("Payload too large", { status: 413 });
      const id = `up${++n}`;
      uploads.set(id, { total, dados: new Uint8Array(total), offset: 0 });
      return new Response(null, { status: 201, headers: { Location: `/storage/v1/upload/resumable/${id}` } });
    }
    const up = url.match(/resumable\/(up\d+)$/);
    if (up) {
      const u = uploads.get(up[1]);
      if (!u) return new Response(null, { status: 404 });
      if (metodo === "HEAD") return new Response(null, { status: 200, headers: { "Upload-Offset": String(u.offset) } });
      if (metodo === "PATCH") {
        if (Number(h.get("Upload-Offset")) !== u.offset) return new Response(null, { status: 409 });
        const parte = init.body as Uint8Array;
        u.dados.set(parte, u.offset);
        u.offset += parte.byteLength;
        return new Response(null, { status: 204, headers: { "Upload-Offset": String(u.offset) } });
      }
    }
    return new Response("?", { status: 500 });
  }) as typeof fetch;
  return { video, uploads, chamadas, fetch: f };
}

function repoFalso(linha: Partial<CopiaRow> & Record<string, unknown> = {}) {
  const row: CopiaRow & Record<string, unknown> = {
    id: "r1", user_id: "u1", meeting_id: "m1", provider_bot_id: "bot1",
    copia_offset: 0, copia_tamanho: null, copia_upload_url: null, copia_tentativas: 0,
    copia_status: "pendente", copia_lease: null, copia_em: null, ...linha,
  };
  const reunioes: Record<string, string> = {};
  const repo: RepoCopia = {
    async pegarVez(_id, vez, paradaDesde) {
      const livre = !row.copia_em || String(row.copia_em) < paradaDesde;
      if (!["pendente", "copiando"].includes(String(row.copia_status)) || !livre) return null;
      Object.assign(row, { copia_lease: vez, copia_em: new Date().toISOString(), copia_status: "copiando" });
      return { ...row };
    },
    async salvar(_id, vez, campos) { if (row.copia_lease === vez) Object.assign(row, campos); },
    async marcarReuniao(meetingId, caminho) { reunioes[meetingId] = caminho; },
  };
  return { row, reunioes, repo };
}

const deps = (m: ReturnType<typeof mundo>, repo: RepoCopia, extra: Partial<DepsCopia> = {}): DepsCopia => ({
  repo, fetch: m.fetch, gravacao: async () => ({ video: "https://recall.test/video?assinatura=1" }),
  supabaseUrl: "https://sb.test", serviceKey: "chave", ...extra,
});

Deno.test("cópia do vídeo: copia tudo em partes de 6 MB e liga à reunião", async () => {
  const m = mundo(PARTE * 2 + 1234);
  const f = repoFalso();
  assertEquals(await copiarVideo("r1", deps(m, f.repo)), "concluida");
  const [up] = [...m.uploads.values()];
  assertEquals(up.dados, m.video);
  assertEquals(m.chamadas.filter((c) => c.startsWith("PATCH")).length, 3);
  assertEquals(f.reunioes.m1, "u1/robo-m1.mp4");
  assertEquals([f.row.copia_status, f.row.copia_lease, f.row.copia_upload_url], ["concluida", null, null]);
});

Deno.test("cópia do vídeo: para no prazo e a próxima chamada continua de onde parou", async () => {
  const m = mundo(PARTE * 3 + 10);
  const f = repoFalso();
  let relogio = 0;
  const lento = { prazoMs: 6500, agora: () => (relogio += 1000) };
  assertEquals(await copiarVideo("r1", deps(m, f.repo, lento)), "continua");
  const parou = f.row.copia_offset as number;
  assertEquals(parou > 0 && parou < PARTE * 3 + 10, true);
  assertEquals(f.row.copia_em, null); // soltou a vez para a próxima chamada
  assertEquals(await copiarVideo("r1", deps(m, f.repo)), "concluida");
  assertEquals(m.uploads.size, 1); // continuou o mesmo envio
  assertEquals([...m.uploads.values()][0].dados, m.video);
});

Deno.test("cópia do vídeo: envio vencido no Storage abre outro", async () => {
  const m = mundo(PARTE + 5);
  const f = repoFalso({ copia_upload_url: "https://sb.test/storage/v1/upload/resumable/up99", copia_offset: PARTE, copia_tamanho: PARTE + 5 });
  assertEquals(await copiarVideo("r1", deps(m, f.repo)), "concluida");
  assertEquals([...m.uploads.values()][0].dados, m.video);
});

Deno.test("cópia do vídeo: acima do limite do Storage para com o motivo", async () => {
  const m = mundo(PARTE * 2, { limiteStorage: PARTE });
  const f = repoFalso();
  assertEquals(await copiarVideo("r1", deps(m, f.repo)), "erro");
  assertEquals(f.row.copia_status, "erro");
  assertEquals(String(f.row.copia_detalhe).includes("limite de tamanho"), true);
});

Deno.test("cópia do vídeo: outra chamada copiando agora, esta não mexe", async () => {
  const m = mundo(PARTE);
  const f = repoFalso({ copia_status: "copiando", copia_em: new Date().toISOString(), copia_lease: "outra" });
  assertEquals(await copiarVideo("r1", deps(m, f.repo)), "ocupada");
  assertEquals(m.chamadas.length, 0);
});

Deno.test("cópia do vídeo: robô sem vídeo na Recall vira erro definitivo", async () => {
  const m = mundo(PARTE);
  const f = repoFalso();
  assertEquals(await copiarVideo("r1", deps(m, f.repo, { gravacao: async () => ({ video: null }) })), "erro");
  assertEquals(f.row.copia_status, "erro");
});
