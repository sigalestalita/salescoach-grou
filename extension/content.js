// Sales Coach AI - Content Script
// Injected into the active tab. Creates a floating overlay and handles recording.

(() => {
  // Prevent double injection
  if (document.getElementById('salescoach-overlay')) {
    // Already injected, just trigger start
    window.__salescoachStartRecording?.();
    return;
  }

  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
  const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

  let mediaRecorder = null;
  let recordedChunks = [];
  let screenStream = null;
  let micStream = null;
  let audioContext = null;
  let timerInterval = null;
  let startTime = null;

  // ── Create overlay DOM ──
  const overlay = document.createElement('div');
  overlay.id = 'salescoach-overlay';
  overlay.innerHTML = `
    <button class="sc-minimize" id="sc-minimize" title="Minimizar">─</button>
    <div class="sc-header">
      <span>🎯</span>
      <h2>Sales Coach AI</h2>
      <div class="sc-dot"></div>
    </div>
    <div class="sc-body">
      <div id="sc-init" class="sc-status sending">🖥 Selecione a tela para compartilhar...</div>
      <div id="sc-recording" style="display:none;">
        <div class="sc-recording-indicator">
          <div class="sc-pulse"></div>
          <span>Gravando...</span>
        </div>
        <div class="sc-timer" id="sc-timer">00:00:00</div>
        <div class="sc-mode" id="sc-mode">🖥 Tela + 🎙 Áudio</div>
        <button class="sc-btn sc-btn-danger" id="sc-btn-stop">⏹ Parar e Enviar</button>
      </div>
      <div id="sc-status-msg" style="display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── DOM refs ──
  const initEl = document.getElementById('sc-init');
  const recordingEl = document.getElementById('sc-recording');
  const statusMsgEl = document.getElementById('sc-status-msg');
  const timerEl = document.getElementById('sc-timer');
  const modeEl = document.getElementById('sc-mode');
  const stopBtn = document.getElementById('sc-btn-stop');
  const minimizeBtn = document.getElementById('sc-minimize');

  // ── Minimize toggle ──
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

  // ── Stop button ──
  stopBtn.addEventListener('click', () => stopRecording());

  // ── Listen for messages from popup/background ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'startRecording') {
      startRecording();
    }
    if (msg.action === 'stopRecording') {
      stopRecording();
    }
  });

  // Expose for re-injection
  window.__salescoachStartRecording = startRecording;

  // Auto-start when injected
  startRecording();

  // ── Recording logic ──
  async function startRecording() {
    let hasScreen = false;
    let hasSystemAudio = false;

    initEl.style.display = '';
    recordingEl.style.display = 'none';
    statusMsgEl.style.display = 'none';

    // Step 1: Screen share
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 15 } },
        audio: true,
      });
      hasScreen = true;
      hasSystemAudio = screenStream.getAudioTracks().length > 0;

      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording());
    } catch (err) {
      console.warn('Screen capture denied:', err.message);
    }

    // Step 2: Microphone
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      console.error('Mic access failed:', err);
      if (!hasScreen) {
        showStatus('error', '❌ Permissões de microfone e tela negadas.');
        notifyBackground('captureError', { error: 'Permissões negadas' });
        autoRemove(6000);
        return;
      }
    }

    if (!screenStream && !micStream) {
      showStatus('error', '❌ Nenhuma fonte disponível.');
      autoRemove(6000);
      return;
    }

    // Step 3: Mix audio
    audioContext = new AudioContext();
    const mixedDest = audioContext.createMediaStreamDestination();

    if (micStream) {
      audioContext.createMediaStreamSource(micStream).connect(mixedDest);
    }
    if (hasSystemAudio) {
      audioContext.createMediaStreamSource(
        new MediaStream(screenStream.getAudioTracks())
      ).connect(mixedDest);
    }

    // Step 4: Combined stream
    const tracks = [...mixedDest.stream.getAudioTracks()];
    if (hasScreen) tracks.unshift(...screenStream.getVideoTracks());
    const combinedStream = new MediaStream(tracks);

    const isVideo = hasScreen && screenStream.getVideoTracks().length > 0;
    const mimeType = isVideo ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
    const mode = isVideo ? 'screen_audio' : 'audio_only';

    // Step 5: MediaRecorder
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      ...(isVideo ? { videoBitsPerSecond: 1_000_000 } : {}),
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      showStatus('sending', '⏳ Enviando gravação...');
      notifyBackground('uploadStarted');

      if (recordedChunks.length === 0) {
        showStatus('error', '❌ Nenhum dado gravado.');
        cleanup();
        autoRemove(6000);
        return;
      }

      const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || mimeType });
      if (blob.size < 100) {
        showStatus('error', '❌ Gravação vazia.');
        cleanup();
        autoRemove(6000);
        return;
      }

      await uploadRecording(blob);
      cleanup();
    };

    mediaRecorder.start(1000);

    // Update UI
    startTime = Date.now();
    initEl.style.display = 'none';
    recordingEl.style.display = '';
    modeEl.textContent = isVideo ? '🖥 Tela + 🎙 Áudio' : '🎙 Apenas áudio';
    startTimer();

    // Save state
    chrome.storage.local.set({
      recordingState: 'recording',
      recordingStartTime: startTime,
      recordingMode: mode,
      isScreenSharing: isVideo,
    });

    notifyBackground('recordingStarted', { mode, startTime });
    console.log('Sales Coach AI: Recording started -', mode);
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

  // ── Upload ──
  async function refreshAccessToken() {
    try {
      const data = await chrome.storage.local.get(['refreshToken']);
      if (!data.refreshToken) return null;
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: data.refreshToken }),
      });
      if (!res.ok) return null;
      const result = await res.json();
      chrome.storage.local.set({ accessToken: result.access_token, refreshToken: result.refresh_token });
      return result.access_token;
    } catch { return null; }
  }

  async function uploadRecording(blob) {
    chrome.storage.local.set({ recordingState: 'uploading' });

    try {
      const data = await chrome.storage.local.get(['accessToken', 'meetingData']);
      let accessToken = data.accessToken;
      const meetingData = data.meetingData || {};

      const freshToken = await refreshAccessToken();
      if (freshToken) accessToken = freshToken;

      if (!accessToken) {
        showStatus('error', '❌ Sessão expirada. Faça login novamente.');
        notifyBackground('uploadError', { error: 'Sessão expirada' });
        autoRemove(6000);
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, `recording-${Date.now()}.webm`);
      formData.append('title', meetingData.title || 'Gravação via Extensão');
      formData.append('meeting_type', meetingData.meetingType || 'empresa');
      formData.append('lead_name', meetingData.leadName || '');
      formData.append('lead_company', meetingData.leadCompany || '');
      formData.append('lead_email', meetingData.leadEmail || '');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Erro (status ${res.status})`);

      chrome.storage.local.set({ recordingState: 'done', lastMeetingId: result.meetingId });
      chrome.storage.local.remove(['meetingData']);

      showStatus('success', '✅ Gravação enviada! A análise será processada automaticamente.');
      notifyBackground('uploadComplete', { meetingId: result.meetingId });
      autoRemove(5000);
    } catch (err) {
      console.error('Upload error:', err);
      showStatus('error', '❌ ' + err.message);
      notifyBackground('uploadError', { error: err.message });
      autoRemove(6000);
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
    chrome.runtime.sendMessage({ action, ...extra }).catch(() => {});
  }

  function autoRemove(delay) {
    setTimeout(() => {
      overlay.remove();
      chrome.storage.local.set({ recordingState: 'idle' });
      chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'isScreenSharing']);
    }, delay);
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }
})();