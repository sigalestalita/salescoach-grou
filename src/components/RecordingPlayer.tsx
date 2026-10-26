import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/**
 * Player da gravação da reunião.
 *
 * O MediaRecorder do Chrome (extensão) grava webm sem a duração no
 * cabeçalho: o navegador vê duração "infinita", o player nativo mostra só o
 * tempo decorrido e a barra parece cheia, como se a reunião tivesse
 * segundos. Para descobrir a duração real, pulamos para o fim do arquivo
 * (o navegador calcula) e voltamos ao início antes de liberar o player.
 *
 * Áudio ganha controles próprios (tempo atual e total, voltar e avançar 15 s,
 * velocidade). Vídeo continua com os controles nativos (tela cheia), com a
 * mesma correção da duração e a velocidade embaixo.
 */

const VELOCIDADES = [1, 1.25, 1.5, 1.75, 2];
const PULO = 15;

function formatTempo(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "--:--";
  const t = Math.floor(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), seg = t % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(seg).padStart(2, "0")}`;
}

function useMidia() {
  const ref = useRef<HTMLMediaElement | null>(null);
  const corrigindo = useRef(false);
  const [duracao, setDuracao] = useState<number | null>(null);
  /** Pode tocar: duração conhecida, ou desistimos de calcular. */
  const [pronto, setPronto] = useState(false);
  const [atual, setAtual] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const [erro, setErro] = useState(false);

  const fimDaCorrecao = useCallback((el: HTMLMediaElement) => {
    corrigindo.current = false;
    if (Number.isFinite(el.duration) && el.duration > 0) setDuracao(el.duration);
    el.currentTime = 0;
    setAtual(0);
    setPronto(true);
  }, []);

  const bind = useCallback((el: HTMLMediaElement | null) => {
    ref.current = el;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let desiste: ReturnType<typeof setTimeout> | undefined;
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuracao(el.duration);
        setPronto(true);
        return;
      }
      corrigindo.current = true;
      el.currentTime = 1e101;
      // Se o navegador não calcular, libera o player sem a duração.
      desiste = setTimeout(() => { if (corrigindo.current) fimDaCorrecao(el); }, 10_000);
    };
    const onDuracao = () => {
      if (corrigindo.current) {
        if (Number.isFinite(el.duration) && el.duration > 0) fimDaCorrecao(el);
      } else if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuracao(el.duration);
      }
    };
    const onTempo = () => {
      if (corrigindo.current) {
        // Alguns navegadores só atualizam a duração no timeupdate do salto.
        if (Number.isFinite(el.duration) && el.duration > 0) fimDaCorrecao(el);
        return;
      }
      setAtual(el.currentTime);
    };
    const onPlay = () => setTocando(true);
    const onPause = () => setTocando(false);
    const onErro = () => setErro(true);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onDuracao);
    el.addEventListener("timeupdate", onTempo);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("error", onErro);
    if (el.readyState >= 1) onMeta();
    return () => {
      clearTimeout(desiste);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onDuracao);
      el.removeEventListener("timeupdate", onTempo);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("error", onErro);
    };
  }, [fimDaCorrecao]);

  const alternar = () => {
    const el = ref.current;
    if (!el || corrigindo.current) return;
    if (el.paused) el.play().catch(() => setErro(true));
    else el.pause();
  };
  const irPara = (s: number) => {
    const el = ref.current;
    if (!el || corrigindo.current) return;
    const max = duracao ?? Number.MAX_SAFE_INTEGER;
    el.currentTime = Math.min(Math.max(0, s), max);
    setAtual(el.currentTime);
  };
  const mudarVelocidade = () => {
    const prox = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length];
    if (ref.current) ref.current.playbackRate = prox;
    setVelocidade(prox);
  };

  return { bind, duracao, pronto, atual, tocando, velocidade, erro, alternar, irPara, mudarVelocidade };
}

function BotaoVelocidade({ velocidade, onClick }: { velocidade: number; onClick: () => void }) {
  return (
    <Button
      type="button" variant="ghost" size="sm" onClick={onClick}
      className="h-8 min-w-[52px] px-2 font-mono text-xs tabular-nums"
      title="Velocidade de reprodução" aria-label={`Velocidade ${velocidade}x. Clique para mudar.`}
    >
      {velocidade.toLocaleString("pt-BR")}x
    </Button>
  );
}

export function RecordingPlayer({ src, video = false, className }: { src: string; video?: boolean; className?: string }) {
  const m = useMidia();
  const { pronto } = m;
  const comDuracao = m.duracao !== null;

  if (m.erro) {
    return (
      <p className={cn("rounded-md border border-dashed p-3 text-sm text-muted-foreground", className)}>
        Não foi possível tocar a gravação neste navegador.{" "}
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-primary underline">Abrir o arquivo</a>
      </p>
    );
  }

  if (video) {
    return (
      <div className={className}>
        <video ref={m.bind} src={src} controls preload="metadata" className="w-full rounded-md border" />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{comDuracao ? `Duração: ${formatTempo(m.duracao!)}` : pronto ? "" : "Calculando a duração…"}</span>
          <BotaoVelocidade velocidade={m.velocidade} onClick={m.mudarVelocidade} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-full bg-muted/60 px-2 py-1.5 sm:gap-3", className)}>
      {/* O elemento de áudio fica escondido: os controles são os de baixo. */}
      <audio ref={m.bind} src={src} preload="metadata" className="hidden" />
      <Button
        type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full"
        onClick={m.alternar} disabled={!pronto} aria-label={m.tocando ? "Pausar" : "Tocar"}
      >
        {!pronto ? <Loader2 className="h-4 w-4 animate-spin" /> : m.tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button
        type="button" size="icon" variant="ghost" className="hidden h-8 w-8 shrink-0 sm:inline-flex"
        onClick={() => m.irPara(m.atual - PULO)} disabled={!pronto} aria-label={`Voltar ${PULO} segundos`} title={`Voltar ${PULO} s`}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        type="button" size="icon" variant="ghost" className="hidden h-8 w-8 shrink-0 sm:inline-flex"
        onClick={() => m.irPara(m.atual + PULO)} disabled={!pronto} aria-label={`Avançar ${PULO} segundos`} title={`Avançar ${PULO} s`}
      >
        <RotateCw className="h-4 w-4" />
      </Button>
      <span className="w-[46px] shrink-0 text-right font-mono text-xs tabular-nums">{formatTempo(m.atual)}</span>
      <Slider
        className="flex-1" min={0} max={comDuracao ? m.duracao! : 1} step={1}
        value={[comDuracao ? Math.min(m.atual, m.duracao!) : 0]}
        onValueChange={([v]) => m.irPara(v)} disabled={!comDuracao} aria-label="Posição na gravação"
      />
      <span className="w-[46px] shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {comDuracao ? formatTempo(m.duracao!) : "--:--"}
      </span>
      <BotaoVelocidade velocidade={m.velocidade} onClick={m.mudarVelocidade} />
    </div>
  );
}
