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
  const SUPABASE_WS = 'wss://xgpfuunmmjkgwjefofcd.functions.supabase.co';
  const SUPABASE_REALTIME_WS = 'wss://xgpfuunmmjkgwjefofcd.supabase.co/realtime/v1/websocket';

  let mediaRecorder = null;
  let recordedChunks = [];  // pedaços da gravação em curso
  let screenStream = null;
  let micStream = null;
  let audioContext = null;
  let liveCtx = null;
  let liveSource = null;
  let liveProcessor = null;
  let liveWS = null;
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

  // ── Overlay DOM ──
  const overlay = document.createElement('div');
  overlay.id = 'salescoach-overlay';
  overlay.innerHTML = `
    <button class="sc-minimize" id="sc-minimize" title="Minimizar">─</button>
    <div class="sc-header">
      <img class="sc-mark" src="${chrome.runtime.getURL('icon48.png')}" alt="">
      <h2>Sales Coach</h2>
      <div class="sc-dot"></div>
    </div>
    <div class="sc-body">
      <div id="sc-init" class="sc-status sending">Selecione a tela para compartilhar…</div>
      <div id="sc-recording" style="display:none;">
        <div class="sc-recording-indicator">
          <div class="sc-pulse"></div>
          <span>Gravando</span>
          <span id="sc-live-flag" class="sc-live-flag">LIVE</span>
        </div>
        <div class="sc-timer" id="sc-timer">00:00:00</div>
        <div class="sc-mode" id="sc-mode">Tela + áudio</div>

        <div class="sc-section-title">Dicas ao vivo</div>
        <div id="sc-tips" class="sc-tips">
          <div class="sc-tips-empty">Aguardando primeiras falas…</div>
        </div>

        <div class="sc-section-title">Transcrição</div>
        <div id="sc-live-text" class="sc-live-text">…</div>

        <button class="sc-btn sc-btn-danger" id="sc-btn-stop">Parar e enviar</button>
      </div>
      <div id="sc-status-msg" style="display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const initEl = document.getElementById('sc-init');
  const recordingEl = document.getElementById('sc-recording');
  const statusMsgEl = document.getElementById('sc-status-msg');
  const timerEl = document.getElementById('sc-timer');
  const modeEl = document.getElementById('sc-mode');
  const stopBtn = document.getElementById('sc-btn-stop');
  const minimizeBtn = document.getElementById('sc-minimize');
  const tipsEl = document.getElementById('sc-tips');
  const liveTextEl = document.getElementById('sc-live-text');
  const liveFlag = document.getElementById('sc-live-flag');

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.classList.toggle('minimized');
    minimizeBtn.textContent = overlay.classList.contains('minimized') ? '◻' : '─';
  });
  overlay.addEventListener('click', () => {
    if (overlay.classList.contains('minimized')) {
      overlay.classList.remove('minimized');
      minimizeBtn.textContent = '─';
    }
  });
  stopBtn.addEventListener('click', () => stopRecording());

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'startRecording') startRecording();
    if (msg.action === 'stopRecording') stopRecording();
  });
  window.__salescoachStartRecording = startRecording;
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

  async function beginRecording() {

    let hasScreen = false, hasSystemAudio = false;
    initEl.style.display = '';
    recordingEl.style.display = 'none';
    statusMsgEl.style.display = 'none';

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 15 } },
        audio: true,
      });
      hasScreen = true;
      hasSystemAudio = screenStream.getAudioTracks().length > 0;
      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording());
    } catch (err) { console.warn('Screen denied:', err.message); }

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
        failWithDownload(chunks, mimeType, err?.message || String(err));
        cleanup();
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
          showStatus('error', '❌ A gravação saiu corrompida e não foi enviada. Grave de novo, com uma gravação por vez.');
          cleanup(); autoRemove(9000); return;
        }
      }
      cleanup();
      await uploadRecording(blob);
    };
    mediaRecorder.start(1000);

    startTime = Date.now();
    initEl.style.display = 'none';
    recordingEl.style.display = '';
    modeEl.textContent = isVideo ? 'Tela + áudio' : 'Apenas áudio';
    startTimer();
    safeStorageSet({
      recordingState: 'recording', recordingStartTime: startTime,
      recordingMode: mode, isScreenSharing: isVideo,
    });
    notifyBackground('recordingStarted', { mode, startTime });

    // ── Live coach pipeline ──
    setLiveText('Conectando transcrição…');
    setTipsStatus('Conectando coach…');
    try {
      const token = await getValidToken();
      if (!token) throw new Error('sessão expirada — refaça login na extensão');
      const data = await chrome.storage.local.get(['meetingData']);
      meetingId = await preCreateMeeting(token, data.meetingData || {});
      if (meetingId) {
        chrome.storage.local.set({ lastMeetingId: meetingId });
        await startLive(token, meetingId, mixedDest.stream);
      } else {
        throw new Error('não foi possível criar a reunião.');
      }
    } catch (e) {
      console.warn('Live coach off:', e);
      liveFlag.style.display = 'none';
      setLiveText('Live indisponível: ' + (e?.message || e));
      setTipsStatus('Coach indisponível.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      recordingEl.style.display = 'none';
    }
  }

  function cleanup() {
    stopTimer();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    recordedChunks = [];
  }

  // ── Live: WebSocket + PCM streaming + tips realtime ──
  async function startLive(token, mid, audioOnlyStream) {
    // 1) Open WS to live-transcribe
    const wsUrl = `${SUPABASE_WS}/live-transcribe?meetingId=${mid}&token=${encodeURIComponent(token)}&apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}`;
    liveWS = new WebSocket(wsUrl);
    liveWS.binaryType = 'arraybuffer';
    liveWS.onopen = () => {
      liveFlag.classList.add('on');
      setLiveText('Conectado. Aguardando fala…');
    };
    liveWS.onerror = (event) => {
      console.error('Sales Coach live transcription WS error:', event);
      liveFlag.classList.remove('on');
      setLiveText('Erro no WebSocket de transcrição.');
    };
    liveWS.onclose = (event) => {
      console.error('Sales Coach live transcription WS closed:', event.code, event.reason);
      liveFlag.classList.remove('on');
      setLiveText(`Transcrição encerrada (${event.code}${event.reason ? ': ' + event.reason : ''}).`);
    };
    liveWS.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.kind === 'turn') setLiveText(m.text || '…');
        else if (m.kind === 'status') setLiveText('Transcrição ativa…');
        else if (m.kind === 'error') setLiveText('Erro de transcrição: ' + m.message);
      } catch {}
    };

    // 2) Capture PCM16 16k mono from mixed audio
    liveCtx = new AudioContext({ sampleRate: 16000 });
    liveSource = liveCtx.createMediaStreamSource(audioOnlyStream);
    liveProcessor = liveCtx.createScriptProcessor(4096, 1, 1);
    liveSource.connect(liveProcessor);
    liveProcessor.connect(liveCtx.destination);
    liveProcessor.onaudioprocess = (e) => {
      if (!liveWS || liveWS.readyState !== 1) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      liveWS.send(pcm.buffer);
    };

    // 3) Subscribe to live_tips with raw Supabase Realtime WS.
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
              setTipsStatus(null); // ready, waiting for tips
            } else {
              setTipsStatus('Falha ao conectar coach: ' + (msg.payload?.response?.reason || 'desconhecido'));
              console.error('phx_join failed', msg);
            }
            return;
          }
          if (msg.event === 'phx_error') {
            setTipsStatus('Erro no canal de dicas.');
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
        setTipsStatus('Erro no WebSocket de dicas.');
      };
      tipsWS.onclose = (event) => {
        console.error('Sales Coach tips Realtime WS closed:', event.code, event.reason);
        if (tipsHeartbeatInterval) clearInterval(tipsHeartbeatInterval);
        tipsHeartbeatInterval = null;
      };
    } catch (e) {
      console.warn('Realtime fail:', e);
      setTipsStatus('Falha ao iniciar canal de dicas.');
    }
  }

  function setLiveText(t) { liveTextEl.textContent = t; }
  function setTipsStatus(t) {
    if (!t) {
      if (!tipsEl.querySelector('.sc-tip')) {
        tipsEl.innerHTML = '<div class="sc-tips-empty">Aguardando primeiras falas…</div>';
      }
      return;
    }
    if (!tipsEl.querySelector('.sc-tip')) {
      tipsEl.innerHTML = `<div class="sc-tips-empty">${escape(t)}</div>`;
    }
  }


  function extractRealtimeTip(msg) {
    if (!msg || msg.event !== 'postgres_changes') return null;
    const data = msg.payload?.data || msg.payload;
    return data?.new || data?.record || null;
  }

  function stopLive() {
    try { liveWS && liveWS.send(JSON.stringify({ action: 'terminate' })); } catch {}
    try { liveWS && liveWS.close(); } catch {}
    try { tipsWS && tipsWS.close(); } catch {}
    try { tipsHeartbeatInterval && clearInterval(tipsHeartbeatInterval); } catch {}
    try { liveProcessor && liveProcessor.disconnect(); } catch {}
    try { liveSource && liveSource.disconnect(); } catch {}
    try { liveCtx && liveCtx.close(); } catch {}
    liveWS = liveProcessor = liveSource = liveCtx = tipsWS = null;
    tipsHeartbeatInterval = null;
  }

  function addTip(tip) {
    if (tipsEl.querySelector('.sc-tips-empty')) tipsEl.innerHTML = '';
    const card = document.createElement('div');
    card.className = `sc-tip sc-tip-${tip.urgencia || 'media'}`;
    card.innerHTML = `
      <div class="sc-tip-head">
        <span class="sc-tip-cat">${escape(tip.categoria || 'dica')}</span>
        <span class="sc-tip-urg">${escape(tip.urgencia || 'media')}</span>
      </div>
      ${tip.acao ? `<div class="sc-tip-action"><span class="sc-tip-say">Fale agora</span>${escape(tip.acao)}</div>` : ''}
      <div class="sc-tip-title">${escape(tip.titulo || '')}</div>
    `;
    tipsEl.prepend(card);
    while (tipsEl.children.length > 5) tipsEl.removeChild(tipsEl.lastChild);
  }
  function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ── Upload ──
  async function uploadRecording(blob) {
    safeStorageSet({ recordingState: 'uploading' });
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
      showStatus('success', 'Gravação enviada! Análise em curso.');
      notifyBackground('uploadComplete', { meetingId: result.meetingId });
      autoRemove(5000);
    } catch (err) {
      const msg = err?.message === 'Failed to fetch'
        ? 'Sem conexão com o Sales Coach.'
        : (err?.message || String(err));
      notifyBackground('uploadError', { error: msg });
      failWithDownload([blob], blob.type, msg);
    }
  }

  // ── Helpers ──
  function showStatus(type, text) {
    initEl.style.display = 'none';
    recordingEl.style.display = 'none';
    statusMsgEl.style.display = '';
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
  function failWithDownload(parts, type, message) {
    const blob = new Blob(parts, { type: type || 'video/webm' });
    showStatus('error', `❌ ${message}`);
    if (blob.size < 100) { autoRemove(8000); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reuniao-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`;
    a.className = 'sc-btn';
    a.style.display = 'block';
    a.style.marginTop = '10px';
    a.style.textAlign = 'center';
    a.style.textDecoration = 'none';
    a.textContent = 'Baixar a gravação';
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;opacity:.8;margin-top:8px;text-align:center';
    hint.textContent = 'Depois, envie o arquivo em Agendas → Nova reunião.';
    const close = document.createElement('button');
    close.className = 'sc-btn';
    close.style.marginTop = '8px';
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
      const h = String(Math.floor(e / 3600)).padStart(2, '0');
      const m = String(Math.floor((e % 3600) / 60)).padStart(2, '0');
      const s = String(e % 60).padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }
  function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
})();
