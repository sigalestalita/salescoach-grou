// Sales Coach - Áudio da chamada (roda no mundo da página, antes do Meet/Teams)
//
// A voz do cliente vinha só do áudio da aba compartilhada. Quando o vendedor
// usa fone e o Meet manda o som para um alto-falante escolhido nas
// configurações, o Chrome não entrega esse áudio na captura da aba: o cliente
// sumia da gravação e da transcrição. Aqui as trilhas de áudio que chegam pela
// chamada (RTCPeerConnection) entram num MediaStream guardado num <audio>
// escondido e mudo; o content.js lê esse elemento pelo DOM e grava o cliente
// direto da chamada, sem depender do alto-falante nem do compartilhamento.
//
// Também roda nos iframes about:blank da página (manifesto: all_frames e
// match_origin_as_fallback): um app pode criar a chamada com o
// RTCPeerConnection "limpo" de um iframe desses, fora do alcance do gancho da
// página principal. Nesse caso o iframe entrega as trilhas para a página
// principal, que guarda tudo num lugar só.
//
// Microfone: a extensão abria o microfone padrão do Chrome, que pode não ser o
// que o Meet usa (um fone desligado, o microfone do celular, um aparelho
// virtual): a voz do vendedor saía muda. Aqui o microfone que a própria
// chamada abriu fica marcado em <html data-sc-microfone>, e o content.js abre
// o mesmo (e troca junto quando o vendedor troca no Meet).
(() => {
  if (window.__salescoachRemoteAudio) return;
  window.__salescoachRemoteAudio = true;

  let guardar;
  let marcarMic;
  let topo = null;
  try { if (window.top !== window && window.top.__salescoachGuardar) topo = window.top; } catch { /* outra origem */ }

  if (topo) {
    guardar = (track) => { try { topo.__salescoachGuardar(track); } catch {} };
    marcarMic = (id) => { try { topo.__salescoachMarcarMic(id); } catch {} };
  } else if (window.top === window) {
    const chamada = new MediaStream();
    const el = document.createElement('audio');
    el.id = 'sc-remote-audio';
    el.muted = true;  // nunca toca: só guarda as trilhas
    el.hidden = true;
    const prender = () => { if (!el.isConnected) (document.documentElement || document.body)?.appendChild(el); };
    prender();
    document.addEventListener('DOMContentLoaded', prender);

    guardar = (track) => {
      if (track.kind !== 'audio' || chamada.getTrackById(track.id)) return;
      chamada.addTrack(track);
      track.addEventListener('ended', () => chamada.removeTrack(track));
      // Só liga o stream ao elemento quando chega a primeira trilha: um
      // <audio> com stream vazio segura o evento "load" da página.
      if (!el.srcObject) el.srcObject = chamada;
    };
    marcarMic = (id) => { try { document.documentElement.dataset.scMicrofone = id; } catch {} };
    // Para os iframes about:blank (ver acima).
    Object.defineProperty(window, '__salescoachGuardar', { value: guardar });
    Object.defineProperty(window, '__salescoachMarcarMic', { value: marcarMic });
  } else {
    return; // iframe de outra origem: não é o nosso caso
  }

  // O microfone que a chamada pede (e cada troca feita nas configurações dela).
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === 'function') {
    const pedir = md.getUserMedia.bind(md);
    md.getUserMedia = function (restricoes) {
      return pedir(restricoes).then((stream) => {
        try {
          const t = stream.getAudioTracks()[0];
          const id = t && t.getSettings && t.getSettings().deviceId;
          if (id) marcarMic(id);
        } catch {}
        return stream;
      });
    };
  }

  const Original = window.RTCPeerConnection;
  if (!Original) return;
  class RTCPeerConnection extends Original {
    constructor(...args) {
      super(...args);
      try { this.addEventListener('track', (e) => guardar(e.track)); } catch {}
    }
  }
  window.RTCPeerConnection = RTCPeerConnection;
  if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = RTCPeerConnection;
})();
