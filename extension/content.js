// Sales Coach - Content Script
// Floating overlay with: recording controls, live transcription, real-time coaching tips.

(() => {
  if (document.getElementById('salescoach-overlay')) {
    // Já existe overlay nesta aba. Pedir gravação de novo não pode abrir uma
    // segunda: duas gravações ao mesmo tempo misturavam os pedaços das duas
    // num arquivo só, que nascia sem cabeçalho e o serviço de transcrição
    // recusava. Se já estiver gravando, não faz nada.
    window.__salescoachStartRecording?.();
    return;
  }

  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
  const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';
  const SUPABASE_REALTIME_WS = 'wss://xgpfuunmmjkgwjefofcd.supabase.co/realtime/v1/websocket';

  let mediaRecorder = null;
  let recordedChunks = [];  // pedaços da gravação em curso
  let screenStream = null;
  let micStream = null;
  let audioContext = null;
  // Trilhas do live: { vendedor, cliente } → { ws, ctx, source, processor, ... }
  let liveChannels = {};
  let liveStartedAt = 0;
  let liveStopping = false;
  let tipsWS = null;
  let tipsHeartbeatInterval = null;
  let realtimeRef = 1;
  let timerInterval = null;
  let startTime = null;
  let meetingId = null;
  // Pedido de gravação em andamento (seletor de tela aberto). O popup injeta
  // este script, que já começa a gravar, e logo depois manda "startRecording":
  // sem esta trava, eram dois seletores de tela e duas gravações disputando o
  // mesmo estado, e a segunda atropelava a primeira.
  let starting = false;
  // Token capturado no início, para o envio não depender de chrome.storage
  // caso a extensão seja recarregada no meio da reunião.
  let lastToken = null;
  // Gravação principal subindo: fechar a aba agora perderia o vídeo.
  let uploading = false;

  // ── Overlay DOM ──
  //
  // Painel claro: a dica mais recente em destaque, o tempo de gravação e o
  // botão de parar no cabeçalho, medidores de áudio e a transcrição recolhida.
  // Arrastável pelo cabeçalho; minimizado vira uma pílula com o tempo.
  const overlay = document.createElement('div');
  overlay.id = 'salescoach-overlay';
  overlay.innerHTML = `
    <div class="sc-head" id="sc-head" title="Arraste para mover">
      <span class="sc-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <img class="sc-mark" src="${chrome.runtime.getURL('icon48.png')}" alt="">
      <span class="sc-name">Sales Coach</span>
      <span class="sc-spacer"></span>
      <span class="sc-rec" id="sc-rec" hidden><i></i><span>REC <span id="sc-timer">00:00</span></span></span>
      <button type="button" class="sc-ibtn sc-stop" id="sc-btn-stop" title="Parar e enviar" aria-label="Parar e enviar" hidden><span></span></button>
      <button type="button" class="sc-ibtn" id="sc-minimize" title="Minimizar" aria-label="Minimizar">
        <svg viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="sc-body">
      <div id="sc-init" class="sc-status sending">Escolha a aba da reunião e clique em Compartilhar.</div>
      <div id="sc-recording" class="sc-section" hidden>
        <div class="sc-confirm" id="sc-confirm" hidden>
          <b>Encerrar a gravação?</b>
          <span id="sc-confirm-text">A gravação é enviada para análise. O resultado chega em alguns minutos.</span>
          <div class="sc-row">
            <button type="button" class="sc-btn" id="sc-confirm-no">Continuar gravando</button>
            <button type="button" class="sc-btn sc-btn-danger" id="sc-confirm-yes">Parar e enviar</button>
          </div>
        </div>
        <div id="sc-alerts" class="sc-section" hidden></div>
        <div id="sc-tips"><div class="sc-empty">Conectando o coach…</div></div>
        <div id="sc-older" hidden>
          <button type="button" class="sc-link" id="sc-older-btn" aria-expanded="false"></button>
          <ul class="sc-older-list" id="sc-older-list" hidden></ul>
        </div>
        <div class="sc-meters" aria-label="Nível de áudio">
          <span>Você</span><div class="sc-bar"><i id="sc-meter-vendedor"></i></div>
          <span>Cliente</span><div class="sc-bar"><i id="sc-meter-cliente"></i></div>
        </div>
        <div class="sc-tx">
          <div class="sc-tx-head">
            <span class="sc-label">Transcrição</span>
            <button type="button" class="sc-link" id="sc-tx-btn" aria-expanded="false">ver tudo</button>
          </div>
          <div class="sc-tx-last" id="sc-live-text">…</div>
          <div class="sc-tx-full" id="sc-tx-full" hidden></div>
        </div>
      </div>
      <div id="sc-status-msg" hidden></div>
    </div>
    <button type="button" class="sc-pill" id="sc-pill" title="Abrir o painel">
      <span class="sc-pill-dot"></span>
      <span class="sc-pill-time" id="sc-pill-time">00:00</span>
      <span class="sc-pill-new" id="sc-pill-new" hidden></span>
    </button>
  `;
  document.body.appendChild(overlay);

  const $id = (id) => document.getElementById(id);
  const initEl = $id('sc-init');
  const recordingEl = $id('sc-recording');
  const statusMsgEl = $id('sc-status-msg');
  const timerEl = $id('sc-timer');
  const recEl = $id('sc-rec');
  const stopBtn = $id('sc-btn-stop');
  const minimizeBtn = $id('sc-minimize');
  const confirmEl = $id('sc-confirm');
  const alertsEl = $id('sc-alerts');
  const tipsEl = $id('sc-tips');
  const olderEl = $id('sc-older');
  const olderBtn = $id('sc-older-btn');
  const olderList = $id('sc-older-list');
  const liveTextEl = $id('sc-live-text');
  const txFullEl = $id('sc-tx-full');
  const txBtn = $id('sc-tx-btn');
  const pillBtn = $id('sc-pill');
  const pillTime = $id('sc-pill-time');
  const pillNew = $id('sc-pill-new');
  const meterEls = { vendedor: $id('sc-meter-vendedor'), cliente: $id('sc-meter-cliente') };

  // Minimizar / restaurar. Dicas que chegam minimizado viram contador na pílula.
  let unseenTips = 0;
  function setMinimized(min) {
    overlay.classList.toggle('minimized', min);
    if (!min) { unseenTips = 0; updatePill(); }
  }
  function updatePill() {
    pillNew.hidden = unseenTips === 0;
    pillNew.textContent = unseenTips === 1 ? '1 dica nova' : `${unseenTips} dicas novas`;
  }
  minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); setMinimized(true); });
  pillBtn.addEventListener('click', () => setMinimized(false));

  // Parar pede confirmação: o botão fica no cabeçalho, perto do minimizar.
  stopBtn.addEventListener('click', () => {
    setMinimized(false);
    $id('sc-confirm-text').textContent = `A gravação de ${timerEl.textContent} é enviada para análise. O resultado chega em alguns minutos.`;
    confirmEl.hidden = false;
    $id('sc-confirm-no').focus();
  });
  $id('sc-confirm-no').addEventListener('click', () => { confirmEl.hidden = true; });
  $id('sc-confirm-yes').addEventListener('click', () => { confirmEl.hidden = true; stopRecording(); });

  olderBtn.addEventListener('click', () => {
    const open = olderList.hidden;
    olderList.hidden = !open;
    olderBtn.setAttribute('aria-expanded', String(open));
    renderOlderLabel();
  });
  txBtn.addEventListener('click', () => {
    const open = txFullEl.hidden;
    txFullEl.hidden = !open;
    liveTextEl.hidden = open;
    txBtn.setAttribute('aria-expanded', String(open));
    txBtn.textContent = open ? 'recolher' : 'ver tudo';
    if (open) txFullEl.scrollTop = txFullEl.scrollHeight;
  });

  // ── Arrastar ──
  // A posição fica salva: a próxima reunião abre o painel no mesmo lugar.
  function placeAt(left, top) {
    const r = overlay.getBoundingClientRect();
    const x = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - r.width - 8));
    const y = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 48));
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
    overlay.style.right = 'auto';
    return { left: x, top: y };
  }
  $id('sc-head').addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = overlay.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    overlay.classList.add('dragging');
    const move = (ev) => placeAt(ev.clientX - dx, ev.clientY - dy);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      overlay.classList.remove('dragging');
      safeStorageSet({ overlayPos: placeAt(ev.clientX - dx, ev.clientY - dy) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  try {
    chrome.storage.local.get(['overlayPos']).then(({ overlayPos }) => {
      if (overlayPos && Number.isFinite(overlayPos.left)) placeAt(overlayPos.left, overlayPos.top);
    }).catch(() => {});
  } catch {}
  window.addEventListener('resize', () => {
    if (overlay.style.right === 'auto') placeAt(parseFloat(overlay.style.left), parseFloat(overlay.style.top));
  });

  // ── Avisos em linguagem simples ──
  // Cada aviso tem uma chave; o mesmo problema não aparece duas vezes.
  const alerts = new Map();
  function setAlert(key, alert) {
    if (alert) alerts.set(key, alert); else alerts.delete(key);
    alertsEl.innerHTML = '';
    alertsEl.hidden = alerts.size === 0;
    for (const a of alerts.values()) {
      const el = document.createElement('div');
      el.className = `sc-alert ${a.kind}`;
      el.setAttribute('role', 'status');
      const icon = a.kind === 'info' ? '<span class="sc-spin"></span>' : '!';
      el.innerHTML = `<span class="sc-alert-ic">${icon}</span><div><b>${escape(a.title)}</b><span>${escape(a.text)}</span></div>`;
      if (a.detail) el.title = a.detail;
      alertsEl.appendChild(el);
    }
  }
  const RECONNECTING = {
    kind: 'info', title: 'Dicas pausadas, reconectando…', text: 'A gravação continua normalmente. Nada se perde.',
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'startRecording') startRecording();
    if (msg.action === 'stopRecording') stopRecording();
  });
  window.__salescoachStartRecording = startRecording;
  // Usado pelo autodetect.js para parar quando a pessoa sai da chamada.
  window.__salescoachStopRecording = stopRecording;
  startRecording();

  // ── Auth helper ──
  /** fetch com prazo: rede ruim vira erro visível, não espera infinita. */
  async function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error('O servidor demorou demais para responder.');
      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  async function refreshAccessToken() {
    try {
      const data = await chrome.storage.local.get(['refreshToken']);
      if (!data.refreshToken) return null;
      const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: data.refreshToken }),
      }, 20000);
      if (!res.ok) return null;
      const r = await res.json();
      chrome.storage.local.set({ accessToken: r.access_token, refreshToken: r.refresh_token });
      return r.access_token;
    } catch { return null; }
  }

  async function getValidToken() {
    try {
      const data = await chrome.storage.local.get(['accessToken']);
      const fresh = await refreshAccessToken();
      lastToken = fresh || data.accessToken || lastToken;
    } catch (err) {
      // Extensão recarregada durante a reunião: chrome.storage deixa de
      // responder nesta aba. Segue com o último token conhecido.
      console.warn('Sales Coach: sem acesso ao armazenamento da extensão:', err?.message || err);
    }
    return lastToken;
  }

  // ── Pre-create meeting (status=ao_vivo) so live channel works ──
  async function preCreateMeeting(token, meta) {
    const userId = (await chrome.storage.local.get(['userId'])).userId;
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{
        title: meta.title || 'Gravação ao vivo',
        meeting_type: meta.meetingType || null,
        lead_name: meta.leadName || null,
        lead_company: meta.leadCompany || null,
        lead_email: meta.leadEmail || null,
        meeting_url: meta.meetingUrl || location.href,
        calendar_event_id: meta.calendarEventId || null,
        attendees: meta.attendees?.length ? meta.attendees : null,
        status: 'ao_vivo',
        meeting_date: new Date().toISOString(),
        seller_id: userId,
      }]),
    }, 20000);
    if (!res.ok) {
      const body = await res.text();
      console.error('preCreateMeeting failed', res.status, body);
      let msg = '';
      try { msg = JSON.parse(body).message || ''; } catch {}
      throw new Error(friendlyCreateError(res.status, msg));
    }
    const rows = await res.json();
    return rows?.[0]?.id || null;
  }

  function friendlyCreateError(status, msg) {
    if (/row-level security/i.test(msg)) {
      return 'sua conta não tem permissão para criar reuniões agora. Se você é operador da plataforma, saia do modo suporte no Sales Coach e tente de novo.';
    }
    if (status === 401) return 'sessão expirada. Saia e entre de novo na extensão.';
    return `não foi possível criar a reunião (${status}${msg ? `: ${msg}` : ''}).`;
  }

  // ── Recording ──
  async function startRecording() {
    // Duas gravações ao mesmo tempo produzem um arquivo ilegível. Se já há uma
    // em curso, mantém a que está rodando.
    if (starting || (mediaRecorder && mediaRecorder.state === 'recording')) {
      console.warn('Sales Coach: já existe uma gravação em curso; o pedido foi ignorado.');
      return;
    }
    starting = true;
    try {
      await beginRecording();
    } finally {
      starting = false;
    }
  }

  async function pedirTela() {
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 15 } },
        audio: true,
        // Abre a escolha já na aba da reunião, com o áudio da aba: um clique
        // em "Compartilhar".
        preferCurrentTab: true,
      });
    } catch (err) {
      console.warn('Screen denied:', err.message);
      return null;
    }
  }

  /** A tela foi recusada: tentar de novo (o clique libera a janela do Chrome) ou seguir só com o áudio. */
  function escolherSemTela() {
    return new Promise((resolve) => {
      initEl.className = 'sc-status error';
      initEl.textContent = 'A tela não foi compartilhada. Sem ela, a gravação fica sem vídeo e sem a voz do cliente.';
      const tela = document.createElement('button');
      tela.type = 'button';
      tela.className = 'sc-btn sc-btn-primary';
      tela.textContent = 'Compartilhar a tela';
      const audio = document.createElement('button');
      audio.type = 'button';
      audio.className = 'sc-btn';
      audio.textContent = 'Gravar só o meu áudio';
      const hint = document.createElement('div');
      hint.className = 'sc-hint';
      hint.textContent = 'Escolha a aba da reunião e deixe "Compartilhar áudio da guia" ligado.';
      const fim = (escolha) => {
        tela.remove(); audio.remove(); hint.remove();
        initEl.className = 'sc-status sending';
        initEl.textContent = 'Escolha a aba da reunião e clique em Compartilhar.';
        resolve(escolha);
      };
      tela.addEventListener('click', () => fim('tela'));
      audio.addEventListener('click', () => fim('audio'));
      initEl.after(tela, audio, hint);
    });
  }

  async function beginRecording() {

    let hasScreen = false, hasSystemAudio = false;
    initEl.hidden = false;
    recordingEl.hidden = true;
    statusMsgEl.hidden = true;

    // Sem a tela, a gravação fica só com o microfone: sem vídeo e sem a voz
    // do cliente. Antes isso acontecia em silêncio; agora a pessoa escolhe.
    screenStream = await pedirTela();
    while (!screenStream) {
      if (await escolherSemTela() !== 'tela') break;
      screenStream = await pedirTela();
    }
    if (screenStream) {
      hasScreen = true;
      hasSystemAudio = screenStream.getAudioTracks().length > 0;
      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording());
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      if (!hasScreen) {
        showStatus('error', '❌ Permissões negadas.');
        autoRemove(6000); return;
      }
    }
    if (!screenStream && !micStream) {
      showStatus('error', '❌ Nenhuma fonte disponível.'); autoRemove(6000); return;
    }

    audioContext = new AudioContext();
    const mixedDest = audioContext.createMediaStreamDestination();
    if (micStream) audioContext.createMediaStreamSource(micStream).connect(mixedDest);
    if (hasSystemAudio) {
      audioContext.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(mixedDest);
    }

    const tracks = [...mixedDest.stream.getAudioTracks()];
    if (hasScreen) tracks.unshift(...screenStream.getVideoTracks());
    const combinedStream = new MediaStream(tracks);

    const isVideo = hasScreen && screenStream.getVideoTracks().length > 0;
    const mimeType = isVideo ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
    const mode = isVideo ? 'screen_audio' : 'audio_only';

    // Os pedaços ficam presos a ESTA gravação. Antes eram empurrados para uma
    // variável do módulo: se uma gravação anterior ainda estivesse viva, os
    // pedaços dela caíam aqui também e o arquivo virava a cauda de um stream
    // colada na frente de outro — sem cabeçalho, ilegível.
    const chunks = [];
    recordedChunks = chunks;
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType, ...(isVideo ? { videoBitsPerSecond: 1_000_000 } : {}),
    });
    const meuRecorder = mediaRecorder;
    mediaRecorder.ondataavailable = (e) => {
      // Só aceita pedaço do gravador atual: um gravador antigo que ainda não
      // parou não contamina o arquivo novo.
      if (e.data.size > 0 && mediaRecorder === meuRecorder) chunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      try {
        await finishRecording();
      } catch (err) {
        // Qualquer falha aqui deixava o painel parado em "Enviando gravação…".
        console.error('Sales Coach: falha ao finalizar a gravação:', err);
        cleanup();
        const rescued = await rescueFromBackup();
        uploading = false;
        const msg = err?.message || String(err);
        failWithDownload(chunks, mimeType, rescued ? `O vídeo não foi enviado (${msg}), mas o áudio foi para análise.` : msg, rescued);
      }
    };

    const finishRecording = async () => {
      showStatus('sending', 'Enviando gravação...');
      notifyBackground('uploadStarted');
      stopLive();
      if (chunks.length === 0) { showStatus('error', '❌ Nada gravado.'); cleanup(); autoRemove(6000); return; }
      const blob = new Blob(chunks, { type: chunks[0]?.type || mimeType });
      if (blob.size < 100) { showStatus('error', '❌ Gravação vazia.'); cleanup(); autoRemove(6000); return; }

      // Um webm começa com a assinatura EBML (1A 45 DF A3). Se o arquivo não
      // começar assim, ele perdeu o cabeçalho e nenhum serviço vai conseguir
      // ler: melhor avisar aqui do que subir 10 MB que voltam como erro.
      if (isVideo || mimeType.includes('webm')) {
        const inicio = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        const ebml = inicio[0] === 0x1a && inicio[1] === 0x45 && inicio[2] === 0xdf && inicio[3] === 0xa3;
        if (!ebml) {
          console.error('Sales Coach: gravação sem cabeçalho EBML, não será enviada.');
          cleanup();
          if (await rescueFromBackup()) {
            showStatus('success', 'A gravação de vídeo saiu corrompida, mas o áudio foi enviado para análise.');
            notifyBackground('uploadComplete', { meetingId });
            autoRemove(8000); return;
          }
          showStatus('error', '❌ A gravação saiu corrompida e não foi enviada. Grave de novo, com uma gravação por vez.');
          autoRemove(9000); return;
        }
      }
      cleanup();
      await uploadRecording(blob);
    };
    mediaRecorder.start(1000);

    startTime = Date.now();
    initEl.hidden = true;
    recordingEl.hidden = false;
    recEl.hidden = false;
    stopBtn.hidden = false;
    recEl.title = isVideo ? 'Gravando tela e áudio' : 'Gravando só o áudio';
    startTimer();
    startMeters(micStream, hasSystemAudio ? new MediaStream(screenStream.getAudioTracks()) : null);
    if (!hasSystemAudio) {
      setAlert('sem-cliente', {
        kind: 'warn', title: 'Não estou ouvindo o cliente',
        text: 'Só a sua voz entra. Pare e compartilhe a aba da reunião com "Compartilhar áudio da guia" marcado.',
      });
    }
    safeStorageSet({
      recordingState: 'recording', recordingStartTime: startTime,
      recordingMode: mode, isScreenSharing: isVideo,
    });
    notifyBackground('recordingStarted', { mode, startTime });

    // ── Live coach pipeline ──
    setLiveText('Conectando a transcrição…');
    setTipsStatus('Conectando o coach…');
    try {
      const token = await getValidToken();
      if (!token) throw new Error('sessão expirada — refaça login na extensão');
      const data = await chrome.storage.local.get(['meetingData']);
      meetingId = await preCreateMeeting(token, data.meetingData || {});
      if (meetingId) {
        chrome.storage.local.set({ lastMeetingId: meetingId });
        // Cópia do áudio subindo aos poucos: protege a reunião se a aba fechar.
        startBackup(mixedDest.stream, meetingId);
        // Microfone = vendedor; áudio da aba = cliente. Sem o áudio da aba,
        // só a trilha do vendedor entra.
        await startLive(token, meetingId, {
          vendedor: micStream,
          cliente: hasSystemAudio ? new MediaStream(screenStream.getAudioTracks()) : null,
        });
      } else {
        throw new Error('não foi possível criar a reunião.');
      }
    } catch (e) {
      console.warn('Live coach off:', e);
      setLiveText('Transcrição ao vivo desligada nesta reunião.');
      setTipsStatus(null);
      tipsEl.innerHTML = '';
      setAlert('live-off', {
        kind: 'warn', title: 'Dicas ao vivo indisponíveis',
        text: 'A gravação continua normalmente e a análise sai no final.',
        detail: String(e?.message || e),
      });
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      recordingEl.hidden = true;
    }
    // A última parte do áudio sobe já: se a aba fechar durante o envio da
    // gravação principal, a cópia está completa.
    stopBackup();
  }

  // ── Cópia do áudio em partes ──
  //
  // Em paralelo à gravação principal (tela + áudio, enviada no fim), grava só
  // o áudio e sobe uma parte a cada 30 s para a função recording-parts. Se a
  // aba ou o navegador fecham antes do envio, o background pede ao servidor
  // que junte as partes e mande o áudio para análise. Com a gravação
  // principal enviada, o servidor apaga as partes.
  const BACKUP_SLICE_MS = 30000;
  let backup = null; // { recorder, meetingId, next, queue, sending, done }

  function startBackup(stream, mid) {
    const tracks = stream.getAudioTracks();
    if (!tracks.length || backup) return;
    try {
      const recorder = new MediaRecorder(new MediaStream(tracks), {
        mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000,
      });
      const b = backup = { recorder, meetingId: mid, next: 0, queue: [], sending: null, stopped: null };
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) { b.queue.push({ index: b.next++, blob: e.data }); pumpBackup(b); }
      };
      b.stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start(BACKUP_SLICE_MS);
      notifyBackground('backupStarted', { meetingId: mid });
    } catch (e) {
      console.warn('Sales Coach: cópia do áudio indisponível', e);
      backup = null;
    }
  }

  function stopBackup() {
    if (backup && backup.recorder.state !== 'inactive') {
      try { backup.recorder.stop(); } catch {}
    }
  }

  /** Sobe as partes na ordem; parte que falha tenta de novo na próxima vez. */
  function pumpBackup(b) {
    if (b.sending || !b.queue.length) return b.sending;
    b.sending = (async () => {
      while (b.queue.length) {
        const part = b.queue[0];
        try {
          const res = await authed(
            `/functions/v1/recording-parts?meetingId=${encodeURIComponent(b.meetingId)}&part=${part.index}`,
            { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: part.blob },
            60000,
          );
          if (!res.ok && res.status !== 413) throw new Error(`status ${res.status}`);
          b.queue.shift();
        } catch (e) {
          console.warn('Sales Coach: parte do áudio não subiu, tentando de novo depois', part.index, e);
          break;
        }
      }
      b.sending = null;
    })();
    return b.sending;
  }

  /**
   * A gravação principal não chegou ao servidor: manda a cópia do áudio para
   * análise. Devolve true se o servidor aceitou.
   */
  async function rescueFromBackup() {
    const b = backup;
    if (!b) return false;
    try {
      stopBackup();
      await Promise.race([b.stopped, new Promise((r) => setTimeout(r, 3000))]);
      for (let i = 0; i < 3 && (b.queue.length || b.sending); i++) {
        await (b.sending || pumpBackup(b));
      }
      const res = await authed('/functions/v1/recording-parts', {
        method: 'POST', body: JSON.stringify({ action: 'finish', meetingId: b.meetingId }),
      }, 120000);
      const data = await res.json().catch(() => ({}));
      if (res.ok) notifyBackground('backupFinished', { meetingId: b.meetingId });
      return res.ok && !!data.finished;
    } catch (e) {
      console.warn('Sales Coach: cópia do áudio não foi enviada', e);
      return false;
    }
  }

  // Fechar a aba com a gravação rodando ou subindo: o Chrome pergunta antes.
  window.addEventListener('beforeunload', (e) => {
    const busy = (mediaRecorder && mediaRecorder.state === 'recording') || uploading;
    if (!busy) return;
    e.preventDefault();
    e.returnValue = 'A gravação ainda não foi enviada.';
  });
  // Saiu mesmo assim: o background junta o áudio que já subiu.
  window.addEventListener('pagehide', () => {
    if (backup && ((mediaRecorder && mediaRecorder.state === 'recording') || uploading)) {
      notifyBackground('recordingAbandoned', { meetingId: backup.meetingId });
    }
  });

  function cleanup() {
    stopTimer();
    stopMeters();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    recordedChunks = [];
  }

  // ── Live: AssemblyAI direto, uma conexão por trilha, + dicas em tempo real ──
  //
  // Antes o áudio passava por um WebSocket aberto numa edge function, que tem
  // tempo máximo de vida: o live parava sozinho no meio da reunião. Agora a
  // extensão conecta direto na AssemblyAI com um token temporário emitido pela
  // função live-session (a chave da AssemblyAI fica no servidor). Cada fala
  // concluída vira um trecho em transcription_segments, com quem falou, e
  // dispara o coach em chamadas curtas.

  const AAI_WS = 'wss://streaming.assemblyai.com/v3/ws?speech_model=u3-rt-pro&encoding=pcm_s16le&sample_rate=16000&format_turns=true';
  const COACH_EVERY_MS = 8000;
  const LABEL = { vendedor: 'Você', cliente: 'Cliente' };
  let lastCoachAt = 0;
  let coachTimer = null;
  const liveLines = [];

  /** Chamada autenticada a uma função ou ao REST; renova a sessão uma vez se expirou. */
  async function authed(path, init = {}, ms = 20000) {
    const doFetch = (token) => fetchWithTimeout(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    }, ms);
    let res = await doFetch(lastToken);
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) { lastToken = fresh; res = await doFetch(fresh); }
    }
    return res;
  }

  async function liveTokens(mid, channels) {
    const res = await authed('/functions/v1/live-session', {
      method: 'POST', body: JSON.stringify({ action: 'start', meetingId: mid, channels }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.tokens) throw new Error(data.error || `transcrição indisponível (${res.status})`);
    return data.tokens;
  }

  function lineHtml(who, text) {
    return `<b>${escape(LABEL[who])}:</b> ${escape(text)}`;
  }
  function renderLive(partial) {
    const last = partial ? { ...partial, text: `${partial.text}…` } : liveLines[liveLines.length - 1];
    if (last) liveTextEl.innerHTML = lineHtml(last.who, last.text);
    else setLiveText('Conectado. Aguardando a primeira fala…');
    const all = liveLines.map((l) => `<div>${lineHtml(l.who, l.text)}</div>`);
    if (partial) all.push(`<div>${lineHtml(partial.who, `${partial.text}…`)}</div>`);
    const atEnd = txFullEl.scrollHeight - txFullEl.scrollTop - txFullEl.clientHeight < 24;
    txFullEl.innerHTML = all.join('') || '<div>Nenhuma fala ainda.</div>';
    if (atEnd) txFullEl.scrollTop = txFullEl.scrollHeight;
  }

  async function saveSegment(mid, who, text) {
    try {
      // org_id é preenchido pelo banco a partir da reunião.
      await authed('/rest/v1/transcription_segments', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ meeting_id: mid, text, is_final: true, speaker: who }),
      });
    } catch (e) {
      console.warn('Sales Coach: trecho não salvo', e);
    }
    scheduleCoach(mid);
  }

  // No máximo uma dica a cada 8 s: abaixo disso elas se atropelam.
  function scheduleCoach(mid) {
    if (coachTimer) return;
    const wait = Math.max(0, COACH_EVERY_MS - (Date.now() - lastCoachAt));
    coachTimer = setTimeout(() => {
      coachTimer = null;
      if (liveStopping) return;
      lastCoachAt = Date.now();
      authed('/functions/v1/live-coach', { method: 'POST', body: JSON.stringify({ meetingId: mid }) }, 30000)
        .catch(() => {});
    }, wait);
  }

  function openChannel(mid, who, stream, token, attempt = 0) {
    const ch = liveChannels[who] || (liveChannels[who] = { who, stream, attempts: 0 });
    ch.attempts = attempt;

    // Áudio: PCM16 16 kHz mono, só desta trilha.
    if (!ch.ctx) {
      ch.ctx = new AudioContext({ sampleRate: 16000 });
      ch.source = ch.ctx.createMediaStreamSource(stream);
      ch.processor = ch.ctx.createScriptProcessor(4096, 1, 1);
      ch.source.connect(ch.processor);
      ch.processor.connect(ch.ctx.destination);
      ch.processor.onaudioprocess = (e) => {
        if (!ch.ws || ch.ws.readyState !== 1) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const v = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
        }
        ch.ws.send(pcm.buffer);
      };
    }

    const ws = new WebSocket(`${AAI_WS}&token=${encodeURIComponent(token)}`);
    ws.binaryType = 'arraybuffer';
    ch.ws = ws;
    ws.onopen = () => {
      ch.attempts = 0;
      ch.down = false;
      if (!Object.values(liveChannels).some((c) => c.down)) setAlert('reconectando', null);
      if (!liveLines.length) renderLive(null);
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type !== 'Turn') return;
        const text = (m.transcript || '').trim();
        if (!text) return;
        if (m.end_of_turn) {
          liveLines.push({ who, text });
          if (liveLines.length > 60) liveLines.shift();
          renderLive(null);
          if (text.length > 2) saveSegment(mid, who, text);
        } else {
          renderLive({ who, text });
        }
      } catch {}
    };
    ws.onclose = (ev) => {
      if (liveStopping || ch.ws !== ws) return;
      console.warn(`Sales Coach: trilha ${who} caiu (${ev.code} ${ev.reason || ''}); reconectando`);
      ch.down = true;
      setAlert('reconectando', RECONNECTING);
      // Reconecta com um token novo, com espera crescente (1, 2, 4... até 30 s).
      const delay = Math.min(30000, 1000 * 2 ** ch.attempts);
      setTimeout(async () => {
        if (liveStopping) return;
        try {
          const tokens = await liveTokens(mid, [who]);
          openChannel(mid, who, stream, tokens[who], ch.attempts + 1);
        } catch (e) {
          console.warn('Sales Coach: reconexão falhou', e);
          ch.attempts += 1;
          ws.onclose({ code: 0, reason: 'retry' });
        }
      }, delay);
    };
  }

  async function startLive(token, mid, streams) {
    lastToken = token;
    liveStopping = false;
    liveStartedAt = Date.now();
    const channels = Object.keys(streams).filter((k) => streams[k] && streams[k].getAudioTracks().length);
    if (!channels.length) throw new Error('sem áudio para transcrever');
    const tokens = await liveTokens(mid, channels);
    for (const who of channels) openChannel(mid, who, streams[who], tokens[who]);
    if (!channels.includes('cliente')) {
      // O aviso "Não estou ouvindo o cliente" já está no painel.
    }
    startTipsRealtime(token, mid);
  }

  function nextRealtimeRef() { return String(realtimeRef++); }

  function sendRealtime(topic, event, payload = {}) {
    if (!tipsWS || tipsWS.readyState !== WebSocket.OPEN) return;
    tipsWS.send(JSON.stringify({ topic, event, payload, ref: nextRealtimeRef() }));
  }

  function startTipsRealtime(token, mid) {
    try {
      const topic = `realtime:tips-${mid}`;
      const url = `${SUPABASE_REALTIME_WS}?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}&vsn=1.0.0`;
      tipsWS = new WebSocket(url);
      let joinRef = null;

      tipsWS.onopen = () => {
        joinRef = nextRealtimeRef();
        tipsWS.send(JSON.stringify({
          topic, event: 'phx_join',
          payload: {
            access_token: token,
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [
                { event: 'INSERT', schema: 'public', table: 'live_tips', filter: `meeting_id=eq.${mid}` },
              ],
            },
          },
          ref: joinRef,
        }));
        tipsHeartbeatInterval = setInterval(() => sendRealtime('phoenix', 'heartbeat', {}), 25000);
      };

      tipsWS.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === 'phx_reply' && msg.ref === joinRef) {
            if (msg.payload?.status === 'ok') {
              setTipsStatus(null); // pronto, aguardando dicas
              setAlert('dicas', null);
            } else {
              setTipsStatus(null);
              setAlert('dicas', { ...RECONNECTING, kind: 'warn', title: 'Dicas ao vivo indisponíveis', detail: msg.payload?.response?.reason || '' });
              console.error('phx_join failed', msg);
            }
            return;
          }
          if (msg.event === 'phx_error') {
            setAlert('dicas', RECONNECTING);
            console.error('phx_error', msg);
            return;
          }
          const tip = extractRealtimeTip(msg);
          if (tip) addTip(tip);
        } catch (e) {
          console.warn('Sales Coach Realtime parse fail:', e);
        }
      };

      tipsWS.onerror = (event) => {
        console.error('Sales Coach tips Realtime WS error:', event);
        setAlert('dicas', RECONNECTING);
      };
      tipsWS.onclose = (event) => {
        console.error('Sales Coach tips Realtime WS closed:', event.code, event.reason);
        if (tipsHeartbeatInterval) clearInterval(tipsHeartbeatInterval);
        tipsHeartbeatInterval = null;
      };
    } catch (e) {
      console.warn('Realtime fail:', e);
      setAlert('dicas', { ...RECONNECTING, kind: 'warn', title: 'Dicas ao vivo indisponíveis' });
    }
  }

  function setLiveText(t) { liveTextEl.textContent = t; }
  function setTipsStatus(t) {
    if (tipsEl.querySelector('.sc-hero')) return;
    tipsEl.innerHTML = `<div class="sc-empty">${escape(t || 'As dicas aparecem aqui conforme a conversa avança.')}</div>`;
  }


  function extractRealtimeTip(msg) {
    if (!msg || msg.event !== 'postgres_changes') return null;
    const data = msg.payload?.data || msg.payload;
    return data?.new || data?.record || null;
  }

  function stopLive() {
    liveStopping = true;
    if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
    const channels = Object.keys(liveChannels);
    for (const ch of Object.values(liveChannels)) {
      try { ch.ws && ch.ws.readyState === 1 && ch.ws.send(JSON.stringify({ type: 'Terminate' })); } catch {}
      try { ch.ws && ch.ws.close(); } catch {}
      try { ch.processor && ch.processor.disconnect(); } catch {}
      try { ch.source && ch.source.disconnect(); } catch {}
      try { ch.ctx && ch.ctx.close(); } catch {}
    }
    liveChannels = {};
    try { tipsWS && tipsWS.close(); } catch {}
    try { tipsHeartbeatInterval && clearInterval(tipsHeartbeatInterval); } catch {}
    tipsWS = null;
    tipsHeartbeatInterval = null;
    // Registra os minutos de transcrição ao vivo (consumo da empresa).
    if (meetingId && channels.length && liveStartedAt) {
      const seconds = Math.round((Date.now() - liveStartedAt) / 1000);
      authed('/functions/v1/live-session', {
        method: 'POST', body: JSON.stringify({ action: 'finish', meetingId, seconds, channels }),
      }).catch(() => {});
      liveStartedAt = 0;
    }
  }

  // Dica mais recente em destaque; as anteriores ficam numa lista recolhida.
  const tipHistory = [];
  function addTip(tip) {
    tipHistory.unshift({ ...tip, at: Date.now() });
    if (tipHistory.length > 6) tipHistory.pop();
    const urg = tip.urgencia === 'alta' ? 'alta' : '';
    const main = tip.acao || tip.titulo || '';
    tipsEl.innerHTML = `
      <div class="sc-hero ${urg}">
        <div class="sc-hero-top">
          <span class="sc-chip">${escape(tip.categoria || 'dica')}</span>
          <span class="sc-age" id="sc-tip-age">agora</span>
        </div>
        ${tip.acao ? '<span class="sc-say">Fale agora</span>' : ''}
        <p class="sc-hero-text">${escape(main)}</p>
        ${tip.acao && tip.titulo ? `<div class="sc-why">${escape(tip.titulo)}</div>` : ''}
      </div>`;
    const older = tipHistory.slice(1);
    olderEl.hidden = older.length === 0;
    olderList.innerHTML = older.map((t) => `<li>${escape(t.acao || t.titulo || '')}</li>`).join('');
    renderOlderLabel();
    if (overlay.classList.contains('minimized')) { unseenTips += 1; updatePill(); }
  }
  function renderOlderLabel() {
    const n = tipHistory.length - 1;
    const arrow = olderList.hidden ? '▸' : '▾';
    olderBtn.textContent = `${arrow} ${n === 1 ? '1 dica anterior' : `${n} dicas anteriores`}`;
  }
  function updateTipAge() {
    const el = document.getElementById('sc-tip-age');
    if (!el || !tipHistory[0]) return;
    const min = Math.floor((Date.now() - tipHistory[0].at) / 60000);
    el.textContent = min < 1 ? 'agora' : `há ${min} min`;
  }

  // ── Medidores de áudio ──
  // Um analisador por trilha, lido a cada 100 ms. Se o áudio do cliente fica
  // mudo por muito tempo, avisa: costuma ser a aba compartilhada sem áudio.
  const CLIENT_SILENCE_MS = 90000;
  let meterCtx = null;
  let meterTimer = null;
  function startMeters(mic, tab) {
    stopMeters();
    try {
      meterCtx = new AudioContext();
      const analysers = {};
      for (const [who, stream] of Object.entries({ vendedor: mic, cliente: tab })) {
        if (!stream || !stream.getAudioTracks().length) continue;
        const a = meterCtx.createAnalyser();
        a.fftSize = 1024;
        meterCtx.createMediaStreamSource(stream).connect(a);
        analysers[who] = { a, buf: new Float32Array(a.fftSize) };
      }
      let lastClientSound = Date.now();
      meterTimer = setInterval(() => {
        for (const who of ['vendedor', 'cliente']) {
          const m = analysers[who];
          let level = 0;
          if (m) {
            m.a.getFloatTimeDomainData(m.buf);
            let sum = 0;
            for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
            const rms = Math.sqrt(sum / m.buf.length);
            level = Math.min(1, Math.sqrt(rms) * 2);
            if (who === 'cliente' && rms > 0.01) lastClientSound = Date.now();
          }
          meterEls[who].style.transform = `scaleX(${level.toFixed(2)})`;
        }
        if (analysers.cliente) {
          const quiet = Date.now() - lastClientSound > CLIENT_SILENCE_MS;
          if (quiet !== alerts.has('cliente-mudo')) {
            setAlert('cliente-mudo', quiet ? {
              kind: 'warn', title: 'Não ouço o cliente há mais de 1 minuto',
              text: 'Se ele está falando, confira se a aba foi compartilhada com áudio.',
            } : null);
          }
        }
      }, 100);
    } catch (e) {
      console.warn('Sales Coach: medidor de áudio indisponível', e);
    }
  }
  function stopMeters() {
    if (meterTimer) { clearInterval(meterTimer); meterTimer = null; }
    if (meterCtx) { meterCtx.close().catch(() => {}); meterCtx = null; }
  }
  function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ── Upload ──
  async function uploadRecording(blob) {
    safeStorageSet({ recordingState: 'uploading' });
    uploading = true;
    try {
      const data = await chrome.storage.local.get(['meetingData']);
      const meta = data.meetingData || {};
      const token = await getValidToken();
      if (!token) { showStatus('error', '❌ Sessão expirada.'); notifyBackground('uploadError', { error: 'Sessão expirada' }); autoRemove(6000); return; }

      const formData = new FormData();
      formData.append('file', blob, `recording-${Date.now()}.webm`);
      formData.append('title', meta.title || 'Gravação via Extensão');
      if (meta.meetingType) formData.append('meeting_type', meta.meetingType);
      formData.append('lead_name', meta.leadName || '');
      formData.append('lead_company', meta.leadCompany || '');
      formData.append('lead_email', meta.leadEmail || '');
      if (meetingId) formData.append('meeting_id', meetingId);
      formData.append('meeting_url', meta.meetingUrl || location.href);
      if (meta.calendarEventId) formData.append('calendar_event_id', meta.calendarEventId);
      if (meta.attendees?.length) formData.append('attendees', JSON.stringify(meta.attendees));
      formData.append('tela', blob.type.startsWith('video/') ? '1' : '0');

      // Prazo generoso: uma reunião longa pode ter centenas de MB.
      const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/upload-recording`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        body: formData,
      }, 15 * 60 * 1000);
      let result = {};
      try { result = await res.json(); } catch {}
      if (!res.ok) throw new Error(result.error || `Erro no envio (status ${res.status})`);

      safeStorageSet({ recordingState: 'done', lastMeetingId: result.meetingId });
      try { chrome.storage.local.remove(['meetingData']); } catch {}
      uploading = false;
      showStatus('success', 'Gravação enviada! Análise em curso.');
      notifyBackground('uploadComplete', { meetingId: result.meetingId });
      autoRemove(5000);
    } catch (err) {
      const msg = err?.message === 'Failed to fetch'
        ? 'Sem conexão com o Sales Coach.'
        : (err?.message || String(err));
      // O vídeo não subiu: o áudio já está quase todo no servidor.
      showStatus('sending', 'O vídeo não subiu. Enviando o áudio da reunião…');
      const rescued = await rescueFromBackup();
      uploading = false;
      notifyBackground(rescued ? 'uploadComplete' : 'uploadError', { error: msg, meetingId });
      failWithDownload([blob], blob.type, rescued
        ? `O vídeo não subiu (${msg}), mas o áudio foi enviado para análise. Se quiser guardar o vídeo, baixe abaixo.`
        : msg, rescued);
    }
  }

  // ── Helpers ──
  function showStatus(type, text) {
    setMinimized(false);
    initEl.hidden = true;
    recordingEl.hidden = true;
    recEl.hidden = true;
    stopBtn.hidden = true;
    statusMsgEl.hidden = false;
    statusMsgEl.className = `sc-status ${type}`;
    statusMsgEl.textContent = text;
  }
  function notifyBackground(action, extra = {}) {
    // Com a extensão recarregada, sendMessage lança na hora (não rejeita a
    // promessa): o .catch sozinho não segurava e o envio parava no meio.
    try { chrome.runtime.sendMessage({ action, ...extra }).catch(() => {}); } catch {}
  }
  function safeStorageSet(obj) {
    try { chrome.storage.local.set(obj).catch?.(() => {}); } catch {}
  }

  /**
   * O envio falhou: mostra o motivo e oferece o arquivo, para a reunião não se
   * perder. O vendedor pode subir o arquivo depois em Agendas.
   */
  function failWithDownload(parts, type, message, rescued = false) {
    const blob = new Blob(parts, { type: type || 'video/webm' });
    showStatus(rescued ? 'success' : 'error', rescued ? message : `❌ ${message}`);
    if (blob.size < 100) { autoRemove(8000); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reuniao-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`;
    a.className = 'sc-btn sc-btn-primary';
    a.textContent = 'Baixar a gravação';
    const hint = document.createElement('div');
    hint.className = 'sc-hint';
    hint.textContent = rescued ? 'O vídeo é opcional: a análise usa o áudio.' : 'Depois, envie o arquivo em Agendas → Nova Agenda.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sc-btn';
    close.textContent = 'Fechar';
    close.addEventListener('click', () => { URL.revokeObjectURL(url); autoRemove(0); });
    statusMsgEl.after(a, hint, close);
    safeStorageSet({ recordingState: 'idle' });
  }
  function autoRemove(delay) {
    setTimeout(() => {
      overlay.remove();
      safeStorageSet({ recordingState: 'idle' });
      try { chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'isScreenSharing']); } catch {}
    }, delay);
  }
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const e = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(e / 3600);
      const m = String(Math.floor((e % 3600) / 60)).padStart(2, '0');
      const s = String(e % 60).padStart(2, '0');
      const text = h ? `${h}:${m}:${s}` : `${m}:${s}`;
      timerEl.textContent = text;
      pillTime.textContent = text;
      if (e % 30 === 0) updateTipAge();
    }, 1000);
  }
  function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
})();
