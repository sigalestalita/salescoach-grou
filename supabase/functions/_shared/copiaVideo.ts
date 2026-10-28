// Cópia do vídeo do robô para o Storage, em partes e retomável.
//
// O webhook copiava o vídeo inteiro de uma vez, em segundo plano. Numa reunião
// longa (centenas de MB), a função acabava antes do fim e a reunião ficava só
// com o áudio temporário da Recall. Agora a cópia vai em partes de 6 MB pelo
// envio resumível do Storage (TUS, o mesmo da extensão): cada chamada copia por
// até PRAZO_MS, anota em meeting_bots até onde chegou e chama a próxima. O
// agendador do meeting-bot (cron) retoma cópias paradas. O link da Recall
// expira, então cada chamada pede um novo. A Recall guarda a gravação 7 dias.
//
// Uma cópia por vez: quem copia guarda uma "vez" (copia_lease) e dá sinal de
// vida em copia_em a cada parte. Sem sinal há mais de PARADA_MS, outra chamada
// pode assumir.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { gravacaoDoRobo } from "./recall.ts";

/** O Storage exige partes de exatamente 6 MB, menos a última. */
export const PARTE = 6 * 1024 * 1024;
/** Quanto cada chamada copia antes de passar a vez (a função tem tempo máximo de vida). */
export const PRAZO_MS = 100_000;
export const MAX_TENTATIVAS = 8;
/** Sem sinal de vida há mais que isto: a cópia parou e pode ser retomada. */
export const PARADA_MS = 3 * 60_000;

/** Tamanho total a partir de "bytes 0-0/123456". */
export function tamanhoDoIntervalo(contentRange: string | null): number | null {
  const m = contentRange?.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/** Primeiro e último byte da próxima parte. */
export function proximaParte(offset: number, total: number): [number, number] {
  return [offset, Math.min(offset + PARTE, total) - 1];
}

const b64 = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
export function metadadosTus(caminho: string, contentType: string): string {
  return [
    `bucketName ${b64("meeting-files")}`, `objectName ${b64(caminho)}`,
    `contentType ${b64(contentType)}`, `cacheControl ${b64("3600")}`,
  ].join(",");
}

export interface CopiaRow {
  id: string;
  user_id: string;
  meeting_id: string | null;
  provider_bot_id: string | null;
  copia_offset: number | null;
  copia_tamanho: number | null;
  copia_upload_url: string | null;
  copia_tentativas: number | null;
}

/** O que a cópia precisa do banco (separado para testar sem banco). */
export interface RepoCopia {
  /** Pega a vez se ninguém está copiando agora. Devolve a linha, ou null. */
  pegarVez(id: string, vez: string, paradaDesde: string): Promise<CopiaRow | null>;
  /** Grava o andamento, só enquanto a vez for desta chamada. */
  salvar(id: string, vez: string, campos: Record<string, unknown>): Promise<void>;
  /** Vídeo guardado: a reunião passa a mostrá-lo. */
  marcarReuniao(meetingId: string, caminho: string): Promise<void>;
}

export interface DepsCopia {
  repo: RepoCopia;
  gravacao: (botId: string) => Promise<{ video: string | null }>;
  fetch: typeof fetch;
  supabaseUrl: string;
  serviceKey: string;
  prazoMs?: number;
  agora?: () => number;
}

export type ResultadoCopia = "concluida" | "continua" | "ocupada" | "erro";

export async function copiarVideo(roboId: string, d: DepsCopia): Promise<ResultadoCopia> {
  const agora = d.agora ?? Date.now;
  const inicio = agora();
  const prazo = d.prazoMs ?? PRAZO_MS;
  const vez = crypto.randomUUID();
  const r = await d.repo.pegarVez(roboId, vez, new Date(agora() - PARADA_MS).toISOString());
  if (!r) return "ocupada";

  const salvar = (campos: Record<string, unknown>) => d.repo.salvar(r.id, vez, { ...campos, copia_em: new Date(agora()).toISOString() });
  const soltar = (campos: Record<string, unknown>) => d.repo.salvar(r.id, vez, { ...campos, copia_em: null, copia_lease: null });
  const falhar = async (detalhe: string, definitivo = false): Promise<ResultadoCopia> => {
    const tentativas = (r.copia_tentativas ?? 0) + 1;
    await soltar({
      copia_status: definitivo || tentativas >= MAX_TENTATIVAS ? "erro" : "copiando",
      copia_tentativas: tentativas, copia_detalhe: detalhe.slice(0, 300),
    });
    return "erro";
  };

  try {
    if (!r.provider_bot_id || !r.meeting_id) return await falhar("Robô sem gravação ou sem reunião.", true);
    const { video } = await d.gravacao(r.provider_bot_id);
    if (!video) return await falhar("A Recall não tem o vídeo desta reunião (gravação só de áudio ou já apagada).", true);

    let total = r.copia_tamanho ?? 0;
    if (!total) {
      const t = await d.fetch(video, { headers: { Range: "bytes=0-0" } });
      total = tamanhoDoIntervalo(t.headers.get("content-range")) ??
        (t.status === 200 ? Number(t.headers.get("content-length")) || 0 : 0);
      await t.body?.cancel().catch(() => {});
      if (!total) return await falhar(`Não foi possível saber o tamanho do vídeo (status ${t.status}).`);
    }

    const caminho = `${r.user_id}/robo-${r.meeting_id}.mp4`;
    const base = `${d.supabaseUrl}/storage/v1/upload/resumable`;
    const auth = { Authorization: `Bearer ${d.serviceKey}`, apikey: d.serviceKey, "Tus-Resumable": "1.0.0" };
    let url = r.copia_upload_url;
    let offset = r.copia_offset ?? 0;

    // Envio já aberto: confere no Storage até onde ele recebeu.
    const conferir = async () => {
      const h = await d.fetch(url!, { method: "HEAD", headers: auth });
      if (h.status === 404 || h.status === 410) return false;
      const srv = Number(h.headers.get("Upload-Offset"));
      if (h.ok && Number.isFinite(srv)) offset = srv;
      return h.ok;
    };
    if (url && !(await conferir())) { url = null; offset = 0; }

    if (!url) {
      const criar = await d.fetch(base, {
        method: "POST",
        headers: { ...auth, "Upload-Length": String(total), "Upload-Metadata": metadadosTus(caminho, "video/mp4"), "x-upsert": "true" },
      });
      if (criar.status === 413) {
        return await falhar(`O vídeo tem ${Math.round(total / 1048576)} MB e passa do limite de tamanho de arquivo do Storage do projeto.`, true);
      }
      const loc = criar.headers.get("Location");
      if (criar.status !== 201 || !loc) {
        return await falhar(`O Storage não abriu o envio (status ${criar.status}): ${(await criar.text()).slice(0, 200)}`);
      }
      url = new URL(loc, base).toString();
      offset = 0;
      await salvar({ copia_upload_url: url, copia_tamanho: total, copia_offset: 0, copia_status: "copiando" });
    }

    let ressincronizou = 0;
    while (offset < total) {
      if (agora() - inicio > prazo) {
        await soltar({ copia_offset: offset, copia_status: "copiando" });
        return "continua";
      }
      const [de, ate] = proximaParte(offset, total);
      const baixar = await d.fetch(video, { headers: { Range: `bytes=${de}-${ate}` } });
      if (baixar.status !== 206 && !(baixar.status === 200 && de === 0 && ate === total - 1)) {
        await baixar.body?.cancel().catch(() => {});
        return await falhar(`A Recall não entregou a parte do vídeo (status ${baixar.status}).`);
      }
      const parte = new Uint8Array(await baixar.arrayBuffer());
      const subir = await d.fetch(url, {
        method: "PATCH",
        headers: { ...auth, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
        body: parte,
      });
      if (subir.status === 409 && ressincronizou++ < 3) {
        await subir.body?.cancel().catch(() => {});
        if (!(await conferir())) return await falhar("O envio no Storage expirou.");
        continue;
      }
      if (subir.status !== 204) {
        return await falhar(`O Storage recusou uma parte do vídeo (status ${subir.status}).`);
      }
      offset = Number(subir.headers.get("Upload-Offset") ?? offset + parte.byteLength);
      await salvar({ copia_offset: offset });
    }

    await d.repo.marcarReuniao(r.meeting_id, caminho);
    await soltar({ copia_status: "concluida", copia_offset: total, copia_detalhe: null, copia_upload_url: null });
    return "concluida";
  } catch (e) {
    return await falhar(e instanceof Error ? e.message : String(e));
  }
}

// ── Banco e chamadas de verdade ─────────────────────────────────────────────

export function repoSupabase(admin: SupabaseClient): RepoCopia {
  return {
    async pegarVez(id, vez, paradaDesde) {
      const { data } = await admin.from("meeting_bots")
        .update({ copia_lease: vez, copia_em: new Date().toISOString(), copia_status: "copiando" })
        .eq("id", id).in("copia_status", ["pendente", "copiando"])
        .or(`copia_em.is.null,copia_em.lt.${paradaDesde}`)
        .select("id, user_id, meeting_id, provider_bot_id, copia_offset, copia_tamanho, copia_upload_url, copia_tentativas")
        .maybeSingle();
      return (data as CopiaRow | null) ?? null;
    },
    async salvar(id, vez, campos) {
      await admin.from("meeting_bots").update(campos).eq("id", id).eq("copia_lease", vez);
    },
    async marcarReuniao(meetingId, caminho) {
      const { error } = await admin.from("meetings")
        .update({ file_url: caminho, file_type: "mp4", gravou_tela: true, youtube_url: null }).eq("id", meetingId);
      if (error) throw error;
    },
  };
}

export function depsDeVerdade(admin: SupabaseClient): DepsCopia {
  return {
    repo: repoSupabase(admin),
    gravacao: gravacaoDoRobo,
    fetch,
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };
}

/** Pede à função meeting-bot que copie (ou continue copiando) o vídeo deste robô. */
export async function chamarCopia(roboId: string): Promise<void> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meeting-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      },
      body: JSON.stringify({ action: "copiar", id: roboId }),
    });
    if (!r.ok) console.error("copia do vídeo: meeting-bot respondeu", r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error("copia do vídeo: não chamou o meeting-bot", e);
  }
}
