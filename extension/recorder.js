// Sales Coach AI - Unified Recorder Window
// Handles: login, meeting form, recording, and upload — all in one window.

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

// ── State ──
let mediaRecorder = null;
let recordedChunks = [];
let screenStream = null;
let micStream = null;
let audioContext = null;
let timerInterval = null;
let startTime = null;

// ── DOM refs ──
const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const formSection = document.getElementById('form-section');
const recordingView = document.getElementById('recording-view');
const statusMsg = document.getElementById('status-msg');
const statusDot = document.getElementById('status-dot');
const modeLabel = document.getElementById('mode-label');
const timerEl = document.getElementById('timer');

// ── Init ──
(async () => {
  const session = await getSession();
  if (session) {
    showMainUI();
    await restoreRecordingState();
  } else {
    showLoginUI();
  }
})();

async function restoreRecordingState() {
  const data = await chrome.storage.local.get(['recordingState', 'recordingStartTime', 'recordingMode']);
  const state = data.recordingState || 'idle';
  if (state === 'uploading' || state === 'stopping') {
    showStatus('sending', '⏳ Enviando gravação...');
    formSection.classList.add('hidden');
  } else if (state === 'done') {
    showStatus('success', '✅ Gravação enviada! A análise será processada automaticamente.');
    formSection.classList.add('hidden');
    setTimeout(resetToForm, 5000);
  } else if (state === 'error') {
    const errData = await chrome.storage.local.get(['uploadError']);
    showStatus('error', '❌ ' + (errData.uploadError || 'Erro desconhecido'));
    formSection.classList.add('hidden');
    setTimeout(resetToForm, 6000);
  }
  // Note: if state === 'recording' but we just opened the window, the old recording is gone.
  // Reset to idle.
  if (state === 'recording') {
    await chrome.storage.local.set({ recordingState: 'idle' });
    chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'isScreenSharing']);
  }
}

// ── Auth ──
function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['accessToken', 'refreshToken', 'userId'], (data) => {
      resolve(data.accessToken && data.userId ? data : null);
    });
  });
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  if (!email || !password) {
    errorEl.textContent = 'Preencha email e senha';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Erro ao fazer login');

    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user.id,
      userEmail: email,
    });

    errorEl.classList.add('hidden');
    showMainUI();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userId', 'userEmail']);
  showLoginUI();
});

// ── UI helpers ──
function showLoginUI() {
  loginSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
  statusDot.classList.add('offline');
}

function showMainUI() {
  loginSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  statusDot.classList.remove('offline');
  formSection.classList.remove('hidden');
  recordingView.classList.add('hidden');
  statusMsg.classList.add('hidden');
}

function showStatus(type, text) {
  statusMsg.className = `status ${type}`;
  statusMsg.textContent = text;
  statusMsg.classList.remove('hidden');
}

function resetToForm() {
  chrome.storage.local.set({ recordingState: 'idle' });
  chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'uploadError', 'isScreenSharing', 'lastMeetingId']);
  showMainUI();
}

// ── Recording ──
document.getElementById('btn-start').addEventListener('click', async () => {
  const title = document.getElementById('meeting-title').value.trim();
  if (!title) {
    alert('Preencha o título da agenda');
    return;
  }

  // Save meeting data
  const meetingData = {
    title,
    meetingType: document.getElementById('meeting-type').value,
    leadName: document.getElementById('lead-name').value.trim(),
    leadCompany: document.getElementById('lead-company').value.trim(),
    leadEmail: document.getElementById('lead-email').value.trim(),
  };
  await chrome.storage.local.set({ meetingData });

  // Start recording in this window
  await startRecording();
});

document.getElementById('btn-stop').addEventListener('click', () => {
  stopRecording();
});

async function startRecording() {
  let hasScreen = false;
  let hasSystemAudio = false;

  // Step 1: Request screen share (with system audio)
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 15 } },
      audio: true,
    });
    hasScreen = true;
    hasSystemAudio = screenStream.getAudioTracks().length > 0;

    screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      stopRecording();
    });
  } catch (err) {
    console.warn('Screen capture denied or failed:', err.message);
  }

  // Step 2: Request microphone
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    console.error('Microphone access failed:', err);
    if (!hasScreen) {
      showStatus('error', '❌ Não foi possível acessar o microfone nem a tela.');
      chrome.runtime.sendMessage({ action: 'captureError', error: 'Permissões negadas' }).catch(() => {});
      return;
    }
  }

  if (!screenStream && !micStream) {
    showStatus('error', '❌ Nenhuma fonte de áudio ou vídeo disponível.');
    return;
  }

  // Step 3: Mix audio streams
  audioContext = new AudioContext();
  const mixedDest = audioContext.createMediaStreamDestination();

  if (micStream) {
    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(mixedDest);
  }
  if (hasSystemAudio) {
    const systemSource = audioContext.createMediaStreamSource(
      new MediaStream(screenStream.getAudioTracks())
    );
    systemSource.connect(mixedDest);
  }

  // Step 4: Build combined stream
  const tracks = [...mixedDest.stream.getAudioTracks()];
  if (hasScreen) {
    tracks.unshift(...screenStream.getVideoTracks());
  }
  const combinedStream = new MediaStream(tracks);

  const isVideo = hasScreen && screenStream.getVideoTracks().length > 0;
  const mimeType = isVideo ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
  const mode = isVideo ? 'screen_audio' : 'audio_only';

  // Step 5: Start MediaRecorder
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
    formSection.classList.add('hidden');
    recordingView.classList.add('hidden');

    if (recordedChunks.length === 0) {
      showStatus('error', '❌ Nenhum dado gravado.');
      cleanup();
      return;
    }

    const blobType = recordedChunks[0]?.type || mimeType;
    const blob = new Blob(recordedChunks, { type: blobType });

    if (blob.size < 100) {
      showStatus('error', '❌ Gravação vazia ou corrompida.');
      cleanup();
      return;
    }

    chrome.runtime.sendMessage({ action: 'uploadStarted' }).catch(() => {});
    await uploadRecording(blob);
    cleanup();
  };

  mediaRecorder.start(1000);

  // Update UI
  startTime = Date.now();
  formSection.classList.add('hidden');
  recordingView.classList.remove('hidden');
  statusMsg.classList.add('hidden');
  modeLabel.textContent = isVideo ? '🖥 Tela + 🎙 Áudio' : '🎙 Apenas áudio';
  startTimer();

  // Save state and notify
  await chrome.storage.local.set({
    recordingState: 'recording',
    recordingStartTime: startTime,
    recordingMode: mode,
    isScreenSharing: isVideo,
    uploadError: null,
  });

  chrome.runtime.sendMessage({
    action: 'recordingStarted',
    mode,
    startTime,
  }).catch(() => {});

  console.log(`Recording started: ${mode}`);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    recordingView.classList.add('hidden');
    console.log('Recording stopped');
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
    await chrome.storage.local.set({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    });
    return result.access_token;
  } catch (err) {
    console.error('Token refresh failed:', err);
    return null;
  }
}

async function uploadRecording(blob) {
  await chrome.storage.local.set({ recordingState: 'uploading' });

  try {
    const data = await chrome.storage.local.get(['accessToken', 'refreshToken', 'meetingData']);
    let accessToken = data.accessToken;
    const meetingData = data.meetingData || {};

    const freshToken = await refreshAccessToken();
    if (freshToken) accessToken = freshToken;

    if (!accessToken) {
      showStatus('error', '❌ Sessão expirada. Faça login novamente.');
      chrome.runtime.sendMessage({ action: 'uploadError', error: 'Sessão expirada' }).catch(() => {});
      return;
    }

    const formData = new FormData();
    formData.append('file', blob, `recording-${Date.now()}.webm`);
    formData.append('title', meetingData.title || 'Gravação via Extensão');
    formData.append('meeting_type', meetingData.meetingType || 'empresa');
    formData.append('lead_name', meetingData.leadName || '');
    formData.append('lead_company', meetingData.leadCompany || '');
    formData.append('lead_email', meetingData.leadEmail || '');

    console.log('Uploading, blob size:', blob.size);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    const result = await res.json();
    console.log('Upload response:', res.status, JSON.stringify(result));

    if (!res.ok) {
      throw new Error(result.error || `Erro no upload (status ${res.status})`);
    }

    await chrome.storage.local.set({ recordingState: 'done', lastMeetingId: result.meetingId });
    await chrome.storage.local.remove(['meetingData']);

    showStatus('success', '✅ Gravação enviada! A análise será processada automaticamente.');
    chrome.runtime.sendMessage({ action: 'uploadComplete', meetingId: result.meetingId }).catch(() => {});

    setTimeout(resetToForm, 5000);
  } catch (err) {
    console.error('Upload error:', err);
    showStatus('error', '❌ ' + err.message);
    chrome.runtime.sendMessage({ action: 'uploadError', error: err.message }).catch(() => {});
    setTimeout(resetToForm, 6000);
  }
}

// ── Timer ──
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

// Listen for stop command from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'stopRecording') {
    stopRecording();
  }
});