// Voz do lead no modo de treino, com síntese neural.
//
// A voz do navegador (speechSynthesis) usa o que o sistema operacional tem
// instalado. No Mac e nos navegadores fora o Chrome isso significa a Luciana,
// que soa robótica. Aqui a fala é gerada por um serviço neural e volta como
// áudio pronto para tocar. Sem chave configurada a função responde 501 e o
// navegador cai de volta na voz do sistema — nada quebra.
//
// Os provedores entram em fila, não em escolha única: se o primeiro recusar
// (cota estourada, voz bloqueada no plano, fora do ar), o seguinte assume e a
// pessoa não cai na voz robótica do sistema no meio de um treino.
//
// Ordem: TTS_PROVIDER, se estiver definido, vai na frente; depois as chaves
// dedicadas que existirem; por último o gateway da Lovable, que já é pago pela
// conta do projeto e por isso nunca fica sem cota.

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError, logUsage } from "../_shared/tenant.ts";

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

const MAX_CHARS = 700;

/** Vozes padrão por gênero, por provedor. Podem ser trocadas por env. */
const VOZES = {
  elevenlabs: {
    // Vozes padrão da conta, que o plano free libera pela API. São multilíngues
    // e falam português, com leve sotaque estrangeiro. As vozes brasileiras da
    // biblioteca (Nayara 5p4THmLc2S6kXKO1pOM5, Talis E9a8LlXPNWtyvvSoZzrb) só
    // funcionam do plano Starter para cima: ao assinar, é só apontar as env.
    f: Deno.env.get("ELEVENLABS_VOICE_F") ?? "EXAVITQu4vr4xnSDxMaL", // Sarah
    m: Deno.env.get("ELEVENLABS_VOICE_M") ?? "iP95p4xoKVk53GoZ742B", // Chris
  },
  openai: {
    f: Deno.env.get("OPENAI_VOICE_F") ?? "shimmer",
    m: Deno.env.get("OPENAI_VOICE_M") ?? "onyx",
  },
  gemini: {
    f: Deno.env.get("GEMINI_VOICE_F") ?? "Aoede",
    m: Deno.env.get("GEMINI_VOICE_M") ?? "Charon",
  },
  lovable: {
    f: Deno.env.get("LOVABLE_VOICE_F") ?? "nova",
    m: Deno.env.get("LOVABLE_VOICE_M") ?? "onyx",
  },
};

// Modelos de voz do gateway, na ordem de preferência. O primeiro que
// responder áudio fica guardado para as próximas chamadas.
const MODELOS_LOVABLE = [
  Deno.env.get("LOVABLE_TTS_MODEL") ?? "openai/gpt-4o-mini-tts",
  "google/gemini-2.5-flash-preview-tts",
  "gpt-4o-mini-tts",
];
let modeloLovableOk: string | null = null;

type Provedor = "elevenlabs" | "openai" | "gemini" | "lovable";

const TEM_CHAVE: Record<Provedor, boolean> = {
  elevenlabs: !!ELEVEN_KEY,
  openai: !!OPENAI_KEY,
  gemini: !!GEMINI_KEY,
  lovable: !!LOVABLE_KEY,
};

/** Provedores a tentar, na ordem. Vazio = nenhum configurado. */
function fila(): Provedor[] {
  const escolhido = (Deno.env.get("TTS_PROVIDER") ?? "").trim().toLowerCase() as Provedor;
  const padrao: Provedor[] = ["elevenlabs", "openai", "gemini", "lovable"];
  const ordem = TEM_CHAVE[escolhido] ? [escolhido, ...padrao.filter((p) => p !== escolhido)] : padrao;
  return ordem.filter((p) => TEM_CHAVE[p]);
}

/** WAV de 24 kHz mono a partir do PCM16 cru que o Gemini devolve. */
function pcmParaWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const escreve = (pos: number, txt: string) => { for (let i = 0; i < txt.length; i++) view.setUint8(pos + i, txt.charCodeAt(i)); };
  escreve(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  escreve(8, "WAVE");
  escreve(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escreve(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

async function falaElevenLabs(texto: string, genero: "f" | "m"): Promise<Response> {
  const voz = VOZES.elevenlabs[genero];
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_22050_32`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: texto,
      // Flash é o modelo de menor latência que fala português.
      model_id: Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_flash_v2_5",
      language_code: "pt",
      voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.05 },
    }),
  });
  if (!r.ok) throw new HttpError(502, `ElevenLabs: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function falaOpenAI(texto: string, genero: "f" | "m"): Promise<Response> {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts",
      voice: VOZES.openai[genero],
      input: texto,
      response_format: "mp3",
      instructions: "Fale em português do Brasil, em tom de conversa de telefone comercial: natural, sem locução, sem pressa.",
    }),
  });
  if (!r.ok) throw new HttpError(502, `OpenAI TTS: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function falaGemini(texto: string, genero: "f" | "m"): Promise<Uint8Array> {
  const modelo = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-2.5-flash-preview-tts";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // O prefixo antes dos dois-pontos é instrução de estilo: o modelo fala só o que vem depois.
      contents: [{ parts: [{ text: `Em português do Brasil, em tom de conversa de telefone comercial: ${texto}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZES.gemini[genero] } } },
      },
    }),
  });
  if (!r.ok) throw new HttpError(502, `Gemini TTS: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const b64 = j?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new HttpError(502, "Gemini TTS não devolveu áudio");
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  return pcmParaWav(pcm);
}

/**
 * Voz pelo gateway que o produto já usa para os modelos de texto: mesma
 * chave, mesma conta, nenhuma configuração nova. O gateway é compatível com
 * a API da OpenAI; se o modelo preferido não existir lá, tenta os seguintes.
 */
async function falaLovable(texto: string, genero: "f" | "m"): Promise<Response> {
  const tentativas = modeloLovableOk ? [modeloLovableOk] : MODELOS_LOVABLE;
  let ultimoErro = "";
  for (const modelo of tentativas) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        voice: VOZES.lovable[genero],
        input: texto,
        response_format: "mp3",
        instructions: "Fale em português do Brasil, em tom de conversa de telefone comercial: natural, sem locução, sem pressa.",
      }),
    });
    if (r.ok) {
      modeloLovableOk = modelo;
      return r;
    }
    ultimoErro = `${modelo}: ${r.status} ${(await r.text()).slice(0, 160)}`;
    // 402/429 são conta sem crédito ou limite: trocar de modelo não resolve.
    if (r.status === 402 || r.status === 429) break;
  }
  throw new HttpError(502, `Gateway de voz: ${ultimoErro}`);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ordem = fila();
    if (!ordem.length) return json(req, { error: "tts_nao_configurado" }, 501);

    const ctx = await getCaller(req);
    const { text, gender } = await req.json();
    const texto = String(text ?? "").trim().slice(0, MAX_CHARS);
    if (!texto) throw new HttpError(400, "Texto vazio");
    const genero: "f" | "m" = gender === "male" ? "m" : "f";

    let corpo: BodyInit | null = null;
    let tipo = "audio/mpeg";
    let qual: Provedor | null = null;
    const tropecos: string[] = [];

    for (const candidato of ordem) {
      try {
        if (candidato === "gemini") {
          corpo = await falaGemini(texto, genero);
          tipo = "audio/wav";
        } else {
          const r = candidato === "elevenlabs"
            ? await falaElevenLabs(texto, genero)
            : candidato === "openai"
            ? await falaOpenAI(texto, genero)
            : await falaLovable(texto, genero);
          corpo = await r.arrayBuffer();
          tipo = "audio/mpeg";
        }
        qual = candidato;
        break;
      } catch (e) {
        // Cota estourada, voz fora do plano, provedor fora do ar: anota e tenta o próximo.
        tropecos.push(`${candidato}: ${e instanceof Error ? e.message : e}`.slice(0, 200));
      }
    }

    if (!corpo || !qual) {
      console.error("speak-text: nenhum provedor respondeu —", tropecos.join(" | "));
      return json(req, { error: "tts_indisponivel", detalhes: tropecos }, 502);
    }
    if (tropecos.length) console.warn("speak-text: caiu para", qual, "—", tropecos.join(" | "));

    // Custo de TTS é por caractere; registrar deixa isso visível no consumo.
    logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "tts",
      provider: qual === "lovable" ? "lovable-gateway" : qual,
      model: qual === "lovable" ? (modeloLovableOk ?? "lovable-tts") : qual,
      quantity: texto.length,
      unit: "caracteres",
    }).catch(() => { /* o log não pode atrasar a fala */ });

    return new Response(corpo, {
      headers: { ...corsHeaders(req), "Content-Type": tipo, "Cache-Control": "no-store", "X-Tts-Provider": qual },
    });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("speak-text error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
