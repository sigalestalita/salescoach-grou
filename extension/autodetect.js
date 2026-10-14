// Sales Coach - Detecção de reunião (Meet e Teams)
//
// Roda sozinho nas páginas do Meet e do Teams. Quando o vendedor entra numa
// chamada, oferece a gravação com um clique, com o título já preenchido. Quando
// ele sai da chamada, para a gravação e envia.
//
// Por que não começa a gravar sozinho: o Chrome só deixa capturar a tela e o
// áudio de uma aba depois de um clique da pessoa (e mostra a escolha do que
// compartilhar). O clique em "Gravar" é esse gesto.

(() => {
  if (window.__salescoachAutodetect) return;
  window.__salescoachAutodetect = true;

  const CHECK_MS = 2000;
  // A chamada só conta como encerrada depois de alguns segundos sem o botão de
  // sair: o Meet e o Teams redesenham a barra ao mudar de layout.
  const LEAVE_GRACE_MS = 6000;

  const isMeet = location.hostname === 'meet.google.com';

  // Botão de sair da chamada: só existe enquanto a pessoa está dentro dela.
  const LEAVE_SELECTORS = isMeet
    ? ['button[aria-label*="Sair da chamada" i]', 'button[aria-label*="Leave call" i]', 'button[aria-label*="Salir de la llamada" i]', '[jsname="CQylAd"]']
    : ['#hangup-button', '[data-tid="hangup-main-btn"]', '[data-tid="call-hangup"]', 'button[aria-label*="Sair" i][id*="hangup" i]', 'button[aria-label*="Leave" i][id*="hangup" i]'];

  let card = null;
  let offeredFor = null;     // chave da chamada em que o cartão já apareceu
  let inCallSince = 0;
  let lastSeenInCall = 0;

  function inCall() {
    return LEAVE_SELECTORS.some((s) => document.querySelector(s));
  }

  // Chave da chamada: no Meet, o código da sala; no Teams, o endereço da página.
  function callKey() {
    if (isMeet) return location.pathname.split('/')[1] || location.href;
    return location.pathname + location.hash;
  }

  function meetingTitle() {
    if (isMeet) {
      const attr = document.querySelector('[data-meeting-title]')?.getAttribute('data-meeting-title');
      if (attr) return attr.trim();
    }
    const t = document.title.replace(/^Meet\s*[-–—]\s*/i, '').replace(/\s*\|\s*Microsoft Teams.*$/i, '').trim();
    // Código da sala do Meet (abc-defg-hij) não é título.
    if (t && !/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(t) && !/^(Meet|Microsoft Teams|Google Meet)$/i.test(t)) return t;
    const d = new Date();
    return `Reunião ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function settings() {
    try {
      return await chrome.storage.local.get(['accessToken', 'userId', 'autoDetect', 'recordingState', 'meetingTypesCache', 'recordingTabUrl']);
    } catch {
      // A extensão foi atualizada ou removida: este script ficou órfão.
      return null;
    }
  }

  async function tick() {
    const s = await settings();
    if (!s) return;
    const now = Date.now();
    const here = inCall();
    if (here) {
      lastSeenInCall = now;
      if (!inCallSince) inCallSince = now;
    }

    // Saiu da chamada com a gravação desta aba rodando: para e envia.
    if (!here && s.recordingState === 'recording' && window.__salescoachStopRecording
        && lastSeenInCall && now - lastSeenInCall > LEAVE_GRACE_MS) {
      window.__salescoachStopRecording();
      inCallSince = 0;
      return;
    }
    if (!here) {
      if (lastSeenInCall && now - lastSeenInCall > LEAVE_GRACE_MS) { inCallSince = 0; removeCard(); }
      return;
    }

    const loggedIn = !!(s.accessToken && s.userId);
    const enabled = s.autoDetect !== false;
    const busy = s.recordingState === 'recording' || s.recordingState === 'uploading' || s.recordingState === 'stopping';
    if (!loggedIn || !enabled || busy || card) return;
    if (offeredFor === callKey()) return;
    // Espera a chamada estabilizar antes de oferecer.
    if (now - inCallSince < 3000) return;

    offeredFor = callKey();
    showCard(s.meetingTypesCache || []);
  }

  function removeCard() {
    card?.remove();
    card = null;
  }

  function showCard(types) {
    const host = document.createElement('div');
    host.id = 'salescoach-autodetect';
    host.style.cssText = 'position:fixed;right:20px;bottom:96px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    const opts = types.map((t) => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('');
    root.innerHTML = `
      <style>
        .c{width:320px;background:#071a34;color:#e6eef9;border:1px solid rgba(143,193,255,.25);border-radius:16px;
           padding:16px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)}
        .h{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}
        .h img{width:22px;height:22px}
        p{margin:8px 0 12px;color:#a9b7cc}
        label{display:block;font-size:12px;color:#8fa3bf;margin:8px 0 4px}
        input,select{width:100%;box-sizing:border-box;background:#0e2b4c;color:#fff;border:1px solid rgba(143,193,255,.25);
           border-radius:8px;padding:8px 10px;font:inherit}
        .b{display:flex;gap:8px;margin-top:14px}
        button{flex:1;border:0;border-radius:10px;padding:10px;font:600 14px system-ui,sans-serif;cursor:pointer}
        .go{background:#15498d;color:#fff}.go:hover{background:#1c5bb0}
        .no{background:transparent;color:#a9b7cc;border:1px solid rgba(143,193,255,.25)}
      </style>
      <div class="c" role="dialog" aria-label="Gravar com o Sales Coach">
        <div class="h"><img src="${chrome.runtime.getURL('icon48.png')}" alt="">Gravar esta reunião?</div>
        <p>O Sales Coach grava, dá dicas ao vivo e analisa quando a chamada terminar. Na próxima tela, escolha compartilhar esta aba com o áudio.</p>
        <label for="t">Título</label><input id="t" type="text">
        ${opts ? `<label for="k">Tipo</label><select id="k">${opts}</select>` : ''}
        <label for="e">Empresa do lead (opcional)</label><input id="e" type="text">
        <div class="b"><button class="no" id="no">Agora não</button><button class="go" id="go">Gravar</button></div>
      </div>`;
    root.getElementById('t').value = meetingTitle();
    root.getElementById('no').addEventListener('click', removeCard);
    root.getElementById('go').addEventListener('click', async () => {
      const meetingData = {
        title: root.getElementById('t').value.trim() || meetingTitle(),
        meetingType: root.getElementById('k')?.value || null,
        leadName: '',
        leadCompany: root.getElementById('e').value.trim(),
        leadEmail: '',
      };
      removeCard();
      try {
        await chrome.storage.local.set({ meetingData });
        // O gravador (content.js) é o mesmo do botão da extensão. O clique em
        // "Gravar" ainda vale como gesto quando ele pede a tela.
        await chrome.runtime.sendMessage({ action: 'injectRecorder' });
      } catch (err) {
        console.warn('Sales Coach: não foi possível iniciar a gravação', err);
      }
    });
    document.body.appendChild(host);
    card = host;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  setInterval(tick, CHECK_MS);
})();
