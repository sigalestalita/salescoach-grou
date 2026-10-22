// Sales Coach - Áudio da transcrição ao vivo (AudioWorklet)
//
// Converte a trilha em PCM16 mono e entrega em blocos de 4096 amostras para o
// content.js mandar ao AssemblyAI. Roda na thread de áudio, fora da thread
// da página: não divide tempo com o Meet. Substitui o ScriptProcessorNode,
// que o Chrome marca como obsoleto.
class SalesCoachPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(4096);
    this.n = 0;
  }

  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      const v = Math.max(-1, Math.min(1, canal[i]));
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7FFF;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(4096);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('salescoach-pcm', SalesCoachPcm);
