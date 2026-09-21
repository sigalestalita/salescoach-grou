// Voz do modo de treino.
//
// Gravação: MediaRecorder + getUserMedia, que existem em todo navegador
// moderno. O áudio vai para a edge function transcribe-utterance, que
// transcreve pelo AssemblyAI — o mesmo serviço das reuniões reais.
//
// A versão anterior usava o SpeechRecognition embutido no navegador. Ele
// depende do serviço de fala do Google e só funciona no Chrome do Google:
// em Arc, Brave, Vivaldi e afins o objeto existe (a detecção de suporte
// passava) mas a chamada falhava com erro "network". Daí a troca.
//
// Fala do lead: speechSynthesis, que usa as vozes do próprio sistema
// operacional e não depende de serviço externo. A escolha da voz prefere
// as neurais que o sistema já tem (Edge, Mac) e fala frase a frase.

export interface Recorder {
  /** Encerra a gravação e devolve o áudio e a duração aproximada. */
  stop: () => Promise<{ blob: Blob; durationSeconds: number }>;
  /** Encerra e descarta, liberando o microfone. */
  cancel: () => void;
}

export function isMicSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Formato de gravação que o navegador aceita, em ordem de preferência. */
function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return undefined; // deixa o navegador escolher
}

export async function startRecording(): Promise<Recorder> {
  if (!isMicSupported()) {
    throw new Error("Este navegador não permite gravar áudio. Use o campo de texto para responder.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    // Cada causa tem uma saída diferente para quem está usando; mensagem
    // genérica aqui só faz a pessoa ficar tentando de novo sem saber o motivo.
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error("Permissão de microfone negada. Libere o microfone para este site nas configurações do navegador e tente de novo.");
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("Nenhum microfone encontrado neste computador.");
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      throw new Error("O microfone está ocupado por outro programa (uma chamada aberta, por exemplo). Feche o outro app e tente de novo.");
    }
    if (name === "NotSupportedError") {
      throw new Error("Este navegador não permite gravar áudio nesta página. Use o campo de texto para responder.");
    }
    throw new Error(`Não foi possível abrir o microfone${name ? ` (${name})` : ""}.`);
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const releaseMic = () => stream.getTracks().forEach((track) => track.stop());

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          releaseMic();
          resolve({
            blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
            durationSeconds: (Date.now() - startedAt) / 1000,
          });
        };
        if (recorder.state !== "inactive") recorder.stop();
        else recorder.onstop?.(new Event("stop"));
      }),
    cancel: () => {
      if (recorder.state !== "inactive") recorder.stop();
      releaseMic();
    },
  };
}

/** Converte o áudio gravado para base64, formato aceito pela edge function. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o áudio gravado."));
    reader.readAsDataURL(blob);
  });
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    // Alguns navegadores nunca disparam o evento; não trava a interface.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1200);
  });
  return voicesPromise;
}

// ── Escolha da voz ─────────────────────────────────────────────────────
// Os navegadores expõem vozes muito diferentes entre si. O Edge traz as
// vozes neurais da Microsoft ("Francisca Online (Natural)"), o Mac tem as
// "Aprimoradas" que a pessoa baixa nos Ajustes, o Chrome tem a do Google.
// Pegar a primeira em português, como antes, costumava cair na pior de
// todas. Aqui cada voz ganha uma pontuação e a melhor vence; quem quiser
// escolhe à mão e a escolha fica salva neste navegador.

export type VoiceGender = "f" | "m" | null;

export interface VoiceOption {
  uri: string;
  /** Nome limpo, para mostrar na lista. */
  name: string;
  lang: string;
  /** Voz neural (Natural, Aprimorada, WaveNet…), bem mais humana. */
  neural: boolean;
  gender: VoiceGender;
}

const FEMININOS = ["francisca", "thalita", "brenda", "elza", "giovanna", "leila", "leticia", "manuela", "yara", "luciana", "joana",
  "fernanda", "camila", "vitoria", "maria", "ana", "julia", "raquel", "beatriz", "isabela", "isabella", "carla", "paula", "simone",
  "alice", "helena", "laura", "larissa", "renata", "patricia", "marina", "carolina", "amanda", "bruna", "leticia", "juliana", "flavia", "gabriela"];
const MASCULINOS = ["antonio", "donato", "fabio", "humberto", "julio", "nicolau", "valerio", "felipe", "daniel", "ricardo", "carlos",
  "joao", "pedro", "lucas", "rafael", "bruno", "eduardo", "marcos", "paulo", "rodrigo", "thiago", "tiago", "gustavo", "andre",
  "fernando", "marcelo", "leonardo", "diego", "vinicius", "henrique", "guilherme", "mateus", "matheus", "caio", "sergio"];

const semAcento = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Adivinha o gênero pelo primeiro nome; null quando não dá para saber. */
export function guessGender(fullName: string | null | undefined): VoiceGender {
  if (!fullName) return null;
  const first = semAcento(fullName).trim().split(/[\s(,·-]+/)[0];
  if (!first) return null;
  if (FEMININOS.includes(first)) return "f";
  if (MASCULINOS.includes(first)) return "m";
  if (first.endsWith("a")) return "f";
  if (first.endsWith("o")) return "m";
  return null;
}

function voiceGender(v: SpeechSynthesisVoice): VoiceGender {
  const tokens = semAcento(v.name).split(/[^a-z]+/).filter(Boolean);
  if (tokens.some((t) => FEMININOS.includes(t))) return "f";
  if (tokens.some((t) => MASCULINOS.includes(t))) return "m";
  return null;
}

const isNeural = (v: SpeechSynthesisVoice) => /natural|online|enhanced|premium|aprimorad|neural|wavenet|studio/i.test(v.name);
const isPtBr = (v: SpeechSynthesisVoice) => /^pt[-_]br$/i.test(v.lang);
const isPt = (v: SpeechSynthesisVoice) => /^pt\b/i.test(v.lang);

function scoreVoice(v: SpeechSynthesisVoice, gender: VoiceGender): number {
  let s = 0;
  if (isPtBr(v)) s += 100;
  else if (isPt(v)) s += 60;
  else return -1;
  if (isNeural(v)) s += 50;
  if (/google/i.test(v.name)) s += 15; // a do Chrome é razoável, sem ser neural
  if (gender && voiceGender(v) === gender) s += 30;
  return s;
}

function cleanName(v: SpeechSynthesisVoice): string {
  return v.name
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s*Online\s*\(Natural\)/i, "")
    .replace(/\s*-\s*Portuguese\s*\(Brazil\)/i, "")
    .replace(/\s*\(Brazil\)/i, "")
    .replace(/^Google\s+/i, "Google · ")
    .trim();
}

/** Vozes em português disponíveis neste navegador, da melhor para a pior. */
export async function listVoices(): Promise<VoiceOption[]> {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = await loadVoices();
  return voices
    .filter(isPt)
    .map((v) => ({ v, s: scoreVoice(v, null) }))
    .sort((a, b) => b.s - a.s)
    .map(({ v }) => ({ uri: v.voiceURI, name: cleanName(v), lang: v.lang, neural: isNeural(v), gender: voiceGender(v) }));
}

const VOICE_KEY = "sc:voz-treino";
export function getSavedVoice(): string | null {
  try { return localStorage.getItem(VOICE_KEY); } catch { return null; }
}
export function saveVoice(uri: string | null): void {
  try { uri ? localStorage.setItem(VOICE_KEY, uri) : localStorage.removeItem(VOICE_KEY); } catch { /* sem armazenamento, sem problema */ }
}

async function pickVoice(voiceURI: string | undefined, gender: VoiceGender): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices();
  if (voiceURI) {
    const escolhida = voices.find((v) => v.voiceURI === voiceURI);
    if (escolhida) return escolhida;
  }
  let best: SpeechSynthesisVoice | null = null, bestScore = -1;
  for (const v of voices) {
    const s = scoreVoice(v, gender);
    if (s > bestScore) { best = v; bestScore = s; }
  }
  return best;
}

// ── Fala ────────────────────────────────────────────────────────────────
// Frase a frase, e não o texto inteiro de uma vez: o Chrome corta falas
// longas depois de uns quinze segundos, e a pausa entre frases soa mais
// humana do que uma leitura corrida.

/** Quebra o texto em frases; frases muito longas quebram na vírgula. */
export function splitSentences(text: string): string[] {
  const frases = text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*/g) ?? [text];
  const out: string[] = [];
  for (const f of frases) {
    const t = f.trim();
    if (!t) continue;
    if (t.length <= 220) { out.push(t); continue; }
    let atual = "";
    for (const parte of t.split(/(?<=[,;:])\s+/)) {
      if (atual && (atual + " " + parte).length > 220) { out.push(atual); atual = parte; }
      else atual = atual ? atual + " " + parte : parte;
    }
    if (atual) out.push(atual);
  }
  return out;
}

let falaAtiva = 0;

export interface SpeakOptions {
  lang?: string;
  /** voiceURI escolhida pela pessoa; sem ela, a melhor disponível. */
  voiceURI?: string;
  /** Gênero da persona, para a voz combinar com o nome do lead. */
  gender?: VoiceGender;
}

/** Fala um texto em voz alta. Resolve quando termina (ou falha silenciosamente). */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  const meu = ++falaAtiva;
  window.speechSynthesis.cancel();
  const lang = opts.lang ?? "pt-BR";
  const voice = await pickVoice(opts.voiceURI, opts.gender ?? null);

  for (const frase of splitSentences(text)) {
    if (meu !== falaAtiva) return; // alguém cancelou ou começou outra fala
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = voice?.lang ?? lang;
      u.rate = 1.03;
      u.pitch = 1;
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
    // Respiro curto entre frases, como numa conversa.
    await new Promise((r) => setTimeout(r, 140));
  }
}

/** Uma frase curta na voz escolhida, para a pessoa comparar as opções. */
export function previewVoice(voiceURI?: string, gender: VoiceGender = null): Promise<void> {
  return speak("Oi, tudo bem? Pode falar, estou te ouvindo.", { voiceURI, gender });
}

export function cancelSpeaking(): void {
  falaAtiva++;
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcrição ao vivo (streaming)
//
// O caminho antigo — gravar tudo, subir em base64 e esperar a transcrição em
// lote — custava de 5 a 7 segundos de silêncio depois que a pessoa parava de
// falar. Aqui o áudio sobe enquanto ela fala, pela função roleplay-listen, e o
// texto já está pronto quando ela solta o botão. Se o WebSocket não abrir, a
// página volta sozinha para o caminho antigo.
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveTranscription {
  /** Encerra a fala e devolve o texto reconhecido. */
  stop: () => Promise<string>;
  /** Interrompe e libera o microfone, sem devolver texto. */
  cancel: () => void;
}

export interface LiveOptions {
  url: string;          // wss://<projeto>.functions.supabase.co/roleplay-listen
  token: string;        // access token do usuário
  sessionId: string;
  onPartial?: (texto: string) => void;
}

/** Converte float32 [-1,1] em PCM16 little-endian. */
function paraPcm16(entrada: Float32Array): ArrayBuffer {
  const saida = new Int16Array(entrada.length);
  for (let i = 0; i < entrada.length; i++) {
    const s = Math.max(-1, Math.min(1, entrada[i]));
    saida[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return saida.buffer;
}

export async function startLiveTranscription(opts: LiveOptions): Promise<LiveTranscription> {
  if (!isMicSupported()) throw new Error("Este navegador não permite gravar áudio. Use o campo de texto para responder.");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const ws = new WebSocket(
    `${opts.url}?sessionId=${encodeURIComponent(opts.sessionId)}&token=${encodeURIComponent(opts.token)}`,
  );
  ws.binaryType = "arraybuffer";

  let ultimoParcial = "";
  let resolveFinal: ((texto: string) => void) | null = null;
  let erro: string | null = null;

  const aberto = new Promise<void>((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error("timeout")), 4000);
    ws.onopen = () => { clearTimeout(limite); resolve(); };
    ws.onerror = () => { clearTimeout(limite); reject(new Error("websocket")); };
  });

  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    try {
      const m = JSON.parse(ev.data);
      if (m.kind === "parcial") { ultimoParcial = m.text ?? ""; opts.onPartial?.(ultimoParcial); }
      if (m.kind === "final") { resolveFinal?.(String(m.text ?? ultimoParcial).trim()); resolveFinal = null; }
      if (m.kind === "error") erro = String(m.message ?? "erro");
    } catch { /* ignore */ }
  };

  try {
    await aberto;
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    try { ws.close(); } catch { /* ignore */ }
    throw new Error("Não foi possível abrir a transcrição ao vivo.");
  }

  const ctx = new AudioContext({ sampleRate: 16000 });
  const fonte = ctx.createMediaStreamSource(stream);
  const processador = ctx.createScriptProcessor(4096, 1, 1);
  fonte.connect(processador);
  processador.connect(ctx.destination);
  processador.onaudioprocess = (e) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(paraPcm16(e.inputBuffer.getChannelData(0))); } catch { /* ignore */ }
  };

  const desliga = () => {
    try { processador.disconnect(); fonte.disconnect(); } catch { /* ignore */ }
    ctx.close().catch(() => { /* ignore */ });
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    async stop() {
      desliga();
      if (erro) { try { ws.close(); } catch { /* ignore */ } throw new Error(erro); }
      const final = new Promise<string>((resolve) => {
        resolveFinal = resolve;
        // Se o fechamento do turno não voltar, vale o que já foi reconhecido.
        setTimeout(() => { if (resolveFinal) { resolveFinal = null; resolve(ultimoParcial.trim()); } }, 2500);
      });
      try { ws.send(JSON.stringify({ action: "stop" })); } catch { /* ignore */ }
      const texto = await final;
      try { ws.close(); } catch { /* ignore */ }
      return texto;
    },
    cancel() {
      desliga();
      try { ws.close(); } catch { /* ignore */ }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fala do lead: voz neural quando o servidor tem provedor, voz do sistema quando não
// ─────────────────────────────────────────────────────────────────────────────

export interface FalaOptions {
  /** https://<projeto>.functions.supabase.co/speak-text */
  url?: string;
  token?: string;
  gender?: VoiceGender;
  /** voiceURI escolhida para o caminho de fallback (voz do sistema). */
  voiceURI?: string;
}

/** Guarda entre sessões se o servidor tem voz neural, para não tentar à toa. */
let neuralDisponivel: boolean | null = null;
export function neuralStatus(): boolean | null { return neuralDisponivel; }

async function audioNeural(texto: string, opts: FalaOptions): Promise<HTMLAudioElement | null> {
  if (!opts.url || !opts.token || neuralDisponivel === false) return null;
  try {
    const r = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({ text: texto, gender: opts.gender === "m" ? "male" : "female" }),
    });
    if (r.status === 501) { neuralDisponivel = false; return null; } // sem provedor configurado
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.size < 200) return null;
    neuralDisponivel = true;
    const audio = new Audio(URL.createObjectURL(blob));
    audio.preload = "auto";
    return audio;
  } catch {
    return null;
  }
}

export interface FilaDeFala {
  /** Enfileira um trecho já fechado do texto. */
  push: (trecho: string) => void;
  /** Avisa que não vem mais texto e espera a fala terminar. */
  encerrar: () => Promise<void>;
  /** Corta a fala na hora. */
  cancelar: () => void;
}

/**
 * Fala trecho a trecho, na ordem, enquanto o texto ainda está chegando.
 * Cada trecho é preparado (áudio neural) durante a reprodução do anterior, de
 * modo que a conversa não tem buraco entre as frases.
 */
export function criaFilaDeFala(opts: FalaOptions = {}): FilaDeFala {
  const meu = ++falaAtiva;
  const pendentes: string[] = [];
  let acabou = false;
  let tocando: HTMLAudioElement | null = null;
  let aviso: (() => void) | null = null;
  const vivo = () => meu === falaAtiva;

  const esperaTrecho = () =>
    new Promise<void>((resolve) => {
      aviso = () => { aviso = null; resolve(); };
    });

  async function tocaNeural(audio: HTMLAudioElement) {
    tocando = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    tocando = null;
  }

  async function tocaSistema(texto: string) {
    if (!isSpeechSynthesisSupported()) return;
    const voice = await pickVoice(opts.voiceURI, opts.gender ?? null);
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = voice?.lang ?? "pt-BR";
      u.rate = 1.03;
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  const laco = (async () => {
    // Prepara o próximo áudio enquanto o atual toca.
    let proximo: Promise<HTMLAudioElement | null> | null = null;
    let proximoTexto: string | null = null;
    while (vivo()) {
      if (!pendentes.length && !proximoTexto) {
        if (acabou) break;
        await esperaTrecho();
        continue;
      }
      const texto = proximoTexto ?? pendentes.shift()!;
      const preparado = proximo ?? audioNeural(texto, opts);
      proximo = null;
      proximoTexto = null;

      // Já engatilha o trecho seguinte, se ele existir.
      if (pendentes.length) {
        proximoTexto = pendentes.shift()!;
        proximo = audioNeural(proximoTexto, opts);
      }

      const audio = await preparado;
      if (!vivo()) return;
      if (audio) await tocaNeural(audio);
      else await tocaSistema(texto);
    }
  })();

  return {
    push(trecho: string) {
      const t = trecho.trim();
      if (!t) return;
      pendentes.push(t);
      aviso?.();
    },
    async encerrar() {
      acabou = true;
      aviso?.();
      await laco;
    },
    cancelar() {
      acabou = true;
      falaAtiva++;
      aviso?.();
      if (tocando) { try { tocando.pause(); } catch { /* ignore */ } tocando = null; }
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    },
  };
}

/**
 * Quebra um texto que ainda está chegando em trechos faláveis: devolve os
 * trechos já fechados e o resto que ainda não dá para falar.
 */
export function trechosProntos(buffer: string): { trechos: string[]; resto: string } {
  const trechos: string[] = [];
  let resto = buffer;
  // Fala a cada frase; frases muito curtas se juntam à seguinte para não picotar.
  const re = /[^.!?…]+[.!?…]+[\s]*/g;
  let consumido = 0;
  let acumulado = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer)) !== null) {
    acumulado += m[0];
    consumido = m.index + m[0].length;
    // 12 caracteres: curto o bastante para a primeira fala sair rápido, longo
    // o bastante para "Oi." não virar um trecho sozinho.
    if (acumulado.trim().length >= 12) { trechos.push(acumulado.trim()); acumulado = ""; }
  }
  if (acumulado.trim()) { trechos.push(acumulado.trim()); }
  resto = buffer.slice(consumido);
  return { trechos, resto };
}
