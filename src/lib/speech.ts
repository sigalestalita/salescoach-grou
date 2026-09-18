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
// operacional e não depende de serviço externo — esse continua.

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

/** Fala um texto em voz alta. Resolve quando termina (ou falha silenciosamente). */
export async function speak(text: string, lang = "pt-BR"): Promise<void> {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const voices = await loadVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.toLowerCase().startsWith("pt"));
  if (voice) utterance.voice = voice;

  return new Promise((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function cancelSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
