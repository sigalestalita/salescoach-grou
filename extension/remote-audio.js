// Sales Coach - Áudio da chamada (roda no mundo da página, antes do Meet/Teams)
//
// A voz do cliente vinha só do áudio da aba compartilhada. Quando o vendedor
// usa fone e o Meet manda o som para um alto-falante escolhido nas
// configurações, o Chrome não entrega esse áudio na captura da aba: o cliente
// sumia da gravação e da transcrição. Aqui as trilhas de áudio que chegam pela
// chamada (RTCPeerConnection) entram num MediaStream guardado num <audio>
// escondido e mudo; o content.js lê esse elemento pelo DOM e grava o cliente
// direto da chamada, sem depender do alto-falante nem do compartilhamento.
(() => {
  const Original = window.RTCPeerConnection;
  if (!Original || window.__salescoachRemoteAudio) return;
  window.__salescoachRemoteAudio = true;

  const chamada = new MediaStream();
  const el = document.createElement('audio');
  el.id = 'sc-remote-audio';
  el.muted = true;  // nunca toca: só guarda as trilhas
  el.hidden = true;
  el.srcObject = chamada;
  const prender = () => { if (!el.isConnected) (document.documentElement || document.body)?.appendChild(el); };
  prender();
  document.addEventListener('DOMContentLoaded', prender);

  const guardar = (track) => {
    if (track.kind !== 'audio' || chamada.getTrackById(track.id)) return;
    chamada.addTrack(track);
    track.addEventListener('ended', () => chamada.removeTrack(track));
  };

  class RTCPeerConnection extends Original {
    constructor(...args) {
      super(...args);
      try { this.addEventListener('track', (e) => guardar(e.track)); } catch {}
    }
  }
  window.RTCPeerConnection = RTCPeerConnection;
  if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = RTCPeerConnection;
})();
