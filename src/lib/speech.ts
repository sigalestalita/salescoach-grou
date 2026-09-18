// Reconhecimento e síntese de voz pelo navegador (Web Speech API).
//
// Usado no modo de chamada do treino: fala do vendedor vira texto aqui, no
// navegador, antes de ir para a edge function; a resposta do lead simulado
// volta como texto e é falada aqui também. Nenhum áudio sai da máquina do
// usuário além da própria função de síntese do sistema operacional.
//
// SpeechRecognition é implementado só por Chrome e Edge (não é padrão W3C
// estabilizado — por isso não está nos tipos do DOM do TypeScript). Firefox e
// Safari não têm suporte; isSpeechSupported() cobre essa checagem antes de
// oferecer o modo de chamada.

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && !!getRecognitionCtor() && "speechSynthesis" in window;
}

export interface ListenHandlers {
  /** Chamado a cada trecho reconhecido, final ou não — para legenda ao vivo. */
  onInterim?: (text: string) => void;
  /** Chamado uma vez, quando o navegador detecta pausa na fala. */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  lang?: string;
}

/** Começa a ouvir um único trecho de fala. Devolve um handle para parar manualmente, ou null se o navegador não suporta. */
export function startListening(handlers: ListenHandlers): { stop: () => void } | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Reconhecimento de voz não é suportado neste navegador. Use o Chrome, ou digite a fala.");
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = handlers.lang ?? "pt-BR";
  recognition.continuous = false;
  recognition.interimResults = true;

  let finalText = "";
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) finalText += transcript;
      else interim += transcript;
    }
    handlers.onInterim?.((finalText + interim).trim());
  };
  recognition.onerror = (event) => {
    const message = event.error === "not-allowed" || event.error === "permission-denied"
      ? "Permissão de microfone negada. Libere o microfone para este site e tente de novo."
      : event.error === "no-speech"
      ? "Não captei nenhuma fala. Tente de novo."
      : `Erro no microfone (${event.error}).`;
    handlers.onError?.(message);
  };
  recognition.onend = () => {
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    handlers.onEnd?.();
  };

  recognition.start();
  return { stop: () => recognition.stop() };
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    // Alguns navegadores nunca disparam o evento se a lista já é vazia por design; não trava a UI.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1200);
  });
  return voicesPromise;
}

/** Fala um texto em voz alta. Resolve quando termina (ou falha silenciosamente). */
export async function speak(text: string, lang = "pt-BR"): Promise<void> {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel(); // corta qualquer fala pendente antes de começar a nova
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
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
