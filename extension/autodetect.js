// Sales Coach - Detecção de reunião (Meet e Teams)
//
// Roda sozinho nas páginas do Meet e do Teams. Quando o vendedor entra numa
// chamada, oferece a gravação com um clique, sem formulário: o título vem do
// nome da reunião e o lead é identificado pela análise. Se ele adiar, o cartão
// volta uma vez como lembrete. Quando ele sai da chamada, a gravação para e é
// enviada.
//
// Por que não começa a gravar sozinho: o Chrome só deixa capturar o áudio de
// uma aba depois de um clique da pessoa (e mostra a confirmação do que
// compartilhar). O clique em "Gravar" é esse gesto.

(() => {
  if (window.__salescoachAutodetect) return;
  window.__salescoachAutodetect = true;

  const CHECK_MS = 2000;
  // A chamada só conta como encerrada depois de alguns segundos sem o botão de
  // sair: o Meet e o Teams redesenham a barra ao mudar de layout.
  const LEAVE_GRACE_MS = 6000;
  // "Agora não": o cartão volta uma vez, como lembrete, depois deste tempo.
  const REMIND_AFTER_MS = 2 * 60 * 1000;

  const isMeet = location.hostname === 'meet.google.com';

  // Botão de sair da chamada: só existe enquanto a pessoa está dentro dela.
  const LEAVE_SELECTORS = isMeet
    ? ['button[aria-label*="Sair da chamada" i]', 'button[aria-label*="Leave call" i]', 'button[aria-label*="Salir de la llamada" i]', '[jsname="CQylAd"]']
    : ['#hangup-button', '[data-tid="hangup-main-btn"]', '[data-tid="call-hangup"]', 'button[aria-label*="Sair" i][id*="hangup" i]', 'button[aria-label*="Leave" i][id*="hangup" i]'];

  let card = null;
  // Por chamada: quantas vezes o cartão já apareceu e quando foi adiado.
  let offer = { key: null, shown: 0, snoozedAt: 0 };
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
      return await chrome.storage.local.get(['accessToken', 'userId', 'autoDetect', 'recordingState', 'meetingTypesCache', 'lastMeetingType']);
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

    if (s.autoDetect === false) return;
    const busy = s.recordingState === 'recording' || s.recordingState === 'uploading' || s.recordingState === 'stopping';
    if (busy) { removeCard(); return; }
    const loggedIn = !!(s.accessToken && s.userId);
    if (card) {
      // A sessão chegou pelo site com o cartão "Conecte" na tela: troca pelo
      // cartão de gravar.
      if (card.dataset.loggedIn === 'false' && loggedIn) { removeCard(); offer.shown = 0; } else return;
    }
    // Espera a chamada estabilizar antes de oferecer.
    if (now - inCallSince < 3000) return;

    if (offer.key !== callKey()) offer = { key: callKey(), shown: 0, snoozedAt: 0 };
    if (offer.shown === 0) {
      offer.shown = 1;
      showCard({ loggedIn, types: s.meetingTypesCache || [], lastType: s.lastMeetingType, reminder: false });
    } else if (offer.shown === 1 && offer.snoozedAt && now - offer.snoozedAt > REMIND_AFTER_MS) {
      offer.shown = 2;
      showCard({ loggedIn, types: s.meetingTypesCache || [], lastType: s.lastMeetingType, reminder: true });
    }
  }

  function removeCard() {
    card?.remove();
    card = null;
  }

  function showCard({ loggedIn, types, lastType, reminder }) {
    const host = document.createElement('div');
    host.id = 'salescoach-autodetect';
    host.dataset.loggedIn = String(loggedIn);
    host.style.cssText = 'position:fixed;right:20px;bottom:96px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    const title = meetingTitle();
    // Tipo de reunião: só aparece quando a empresa tem mais de um. Vem marcado
    // o último usado.
    const typeKeys = types.map((t) => t.key);
    const selected = typeKeys.includes(lastType) ? lastType : typeKeys[0];
    const typeSelect = types.length > 1
      ? `<select id="k" aria-label="Tipo de reunião">${types.map((t) =>
          `<option value="${esc(t.key)}"${t.key === selected ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select>`
      : '';

    const heading = !loggedIn
      ? 'Conecte o Sales Coach para gravar'
      : reminder ? 'Esta reunião não está sendo gravada' : 'Gravar esta reunião?';
    const text = !loggedIn
      ? 'Abra o Sales Coach neste navegador com a sua conta e a extensão entra sozinha. Depois, é só voltar aqui.'
      : 'Grava, dá dicas ao vivo e analisa quando a chamada terminar. Na próxima tela, clique em Compartilhar.';
    const primary = loggedIn ? 'Gravar' : 'Abrir o Sales Coach';

    root.innerHTML = `
      <style>
        .c{width:300px;background:#071a34;color:#e6eef9;border:1px solid rgba(143,193,255,.25);border-radius:16px;
           padding:16px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)}
        .h{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}
        .h img{width:22px;height:22px}
        p{margin:8px 0 10px;color:#a9b7cc;font-size:13px}
        .t{font-size:12px;color:#8fa3bf;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        select{width:100%;box-sizing:border-box;background:#0e2b4c;color:#fff;border:1px solid rgba(143,193,255,.25);
           border-radius:8px;padding:7px 9px;font:inherit;font-size:13px}
        .b{display:flex;gap:8px;margin-top:12px}
        button{flex:1;border:0;border-radius:10px;padding:10px;font:600 14px system-ui,sans-serif;cursor:pointer}
        .go{background:#15498d;color:#fff}.go:hover{background:#1c5bb0}
        .no{background:transparent;color:#a9b7cc;border:1px solid rgba(143,193,255,.25)}
      </style>
      <div class="c" role="dialog" aria-label="Sales Coach">
        <div class="h"><img src="${chrome.runtime.getURL('icon48.png')}" alt="">${esc(heading)}</div>
        <p>${esc(text)}</p>
        ${loggedIn ? `<div class="t" title="${esc(title)}">${esc(title)}</div>${typeSelect}` : ''}
        <div class="b"><button class="no" id="no">Agora não</button><button class="go" id="go">${esc(primary)}</button></div>
      </div>`;

    root.getElementById('no').addEventListener('click', () => {
      offer.snoozedAt = Date.now();
      removeCard();
    });
    root.getElementById('go').addEventListener('click', async () => {
      if (!loggedIn) {
        removeCard();
        // Volta a oferecer nesta chamada assim que a sessão chegar.
        offer.shown = 0;
        safeSend({ action: 'openApp' });
        return;
      }
      const meetingType = root.getElementById('k')?.value || selected || null;
      // Sem formulário: nome e empresa do lead ficam em branco e a análise os
      // identifica pela conversa. O vendedor pode corrigir depois no Sales Coach.
      const meetingData = { title, meetingType, leadName: '', leadCompany: '', leadEmail: '' };
      removeCard();
      try {
        await chrome.storage.local.set({ meetingData, lastMeetingType: meetingType });
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

  function safeSend(msg) {
    try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  setInterval(tick, CHECK_MS);
})();
