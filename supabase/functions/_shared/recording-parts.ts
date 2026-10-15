// Cópia de segurança do áudio, enviada em partes durante a reunião.
//
// A extensão grava, em paralelo à gravação principal (tela + áudio), só o
// áudio em webm/opus, e sobe uma parte a cada 30 s. As partes ficam em
// meeting-files/<vendedor>/<reunião>/parts/00000.webm, 00001.webm...
// Juntas, na ordem, formam um webm válido: a primeira traz o cabeçalho.
//
// Se a aba ou o navegador fecham antes do envio da gravação principal, a
// função recording-parts junta as partes e manda o áudio para análise. Com a
// gravação principal enviada, as partes são apagadas.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export const BUCKET = "meeting-files";

export function partsPrefix(userId: string, meetingId: string): string {
  return `${userId}/${meetingId}/parts`;
}

export function partName(index: number): string {
  return `${String(index).padStart(5, "0")}.webm`;
}

/** Nomes das partes já enviadas, em ordem. */
export async function listParts(admin: SupabaseClient, userId: string, meetingId: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(BUCKET)
    .list(partsPrefix(userId, meetingId), { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;
  return (data ?? []).map((f) => f.name).filter((n) => /^\d{5}\.webm$/.test(n)).sort();
}

/** Apaga as partes; falha aqui não atrapalha quem chamou. */
export async function removeParts(admin: SupabaseClient, userId: string, meetingId: string): Promise<void> {
  try {
    const names = await listParts(admin, userId, meetingId);
    if (names.length) {
      await admin.storage.from(BUCKET).remove(names.map((n) => `${partsPrefix(userId, meetingId)}/${n}`));
    }
  } catch (e) {
    console.warn("recording-parts: partes não apagadas", meetingId, e);
  }
}

/** Junta as partes em um único arquivo, na ordem. */
export function concatParts(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}
