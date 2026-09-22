// Áudio do treino no Storage.
//
// O que a pessoa falou e o que o lead respondeu viram arquivos no bucket
// privado roleplay-audio, sob <user_id>/<session_id>/. É isso que permite
// rever uma chamada dias depois, junto da avaliação — antes o áudio só
// existia enquanto a aba estava aberta.
//
// Subir o áudio nunca pode atrapalhar o treino: toda falha aqui é engolida,
// e no máximo a conversa fica sem o replay.

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "roleplay-audio";

/** Sobe um arquivo e devolve o caminho; null se não deu. */
export async function guardaAudio(
  userId: string,
  sessionId: string,
  nome: string,
  audio: Blob,
): Promise<string | null> {
  try {
    const caminho = `${userId}/${sessionId}/${nome}`;
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, audio, {
      contentType: audio.type || "audio/webm",
      upsert: true,
    });
    if (error) throw error;
    return caminho;
  } catch (e) {
    console.warn("Áudio do treino não foi guardado:", e);
    return null;
  }
}

/** Amarra um áudio já guardado a uma fala (a do lead nasce depois da mensagem). */
export async function anexaAudio(messageId: string, audioPath: string): Promise<void> {
  try {
    await supabase.functions.invoke("roleplay-chat", {
      body: { action: "anexar-audio", messageId, audioPath },
    });
  } catch (e) {
    console.warn("Áudio não foi amarrado à fala:", e);
  }
}

/**
 * Baixa os áudios de uma conversa. Devolve um mapa caminho → Blob, para a
 * revisão montar o player com os mesmos controles do treino ao vivo.
 */
export async function baixaAudios(caminhos: string[]): Promise<Map<string, Blob>> {
  const mapa = new Map<string, Blob>();
  await Promise.all(
    caminhos.map(async (caminho) => {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
        if (error || !data) return;
        mapa.set(caminho, data);
      } catch { /* uma fala sem áudio não impede ouvir o resto */ }
    }),
  );
  return mapa;
}

/**
 * Junta os trechos de voz do lead num arquivo só. São MP3s gerados em
 * sequência; emendar os quadros funciona nos navegadores e evita guardar
 * três arquivos para uma resposta.
 */
export function juntaTrechos(trechos: Blob[]): Blob {
  return new Blob(trechos, { type: trechos[0]?.type || "audio/mpeg" });
}
