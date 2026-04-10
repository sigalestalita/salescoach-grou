// Sales Coach AI - Recorder Window
// This runs in a real extension page with full access to getUserMedia and getDisplayMedia.

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

let mediaRecorder = null;
let recordedChunks = [];
let screenStream = null;
let micStream = null;
let audioContext = null;
let timerInterval = null;
let startTime = null;

const initStatus = document.getElementById('init-status');
const recordingView = document.getElementById('recording-view');
const statusMsg = document.getElementById('status-msg');
const modeLabel = document.getElementById('mode-label');
const timerEl = document.getElementById('timer');

// Start recording immediately when the window opens
startRecording();

// Listen for stop command from popup/background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'stopRecording') {
    stopRecording();
  }
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
      audio: true, // Request system audio
    });
    hasScreen = true;
    hasSystemAudio = screenStream.getAudioTracks().length > 0;

    // If user stops screen share via browser UI, stop recording
    screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      stopRecording();
    });
  } catch (err) {
    console.warn('Screen capture denied or failed:', err.message);
    // Continue with mic-only
  }

  // Step 2: Request microphone
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    console.error('Microphone access failed:', err);
    if (!hasScreen) {
      showError('Não foi possível acessar o microfone nem a tela. Verifique as permissões.');
      notifyError('Permissões de microfone e tela negadas.');
      setTimeout(() => window.close(), 5000);
      return;
    }
    // If we have screen but no mic, proceed with screen-only
  }

  if (!screenStream && !micStream) {
    showError('Nenhuma fonte de áudio ou vídeo disponível.');
    notifyError('Nenhuma fonte de áudio ou vídeo disponível.');
    setTimeout(() => window.close(), 5000);
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
    notifyUploadStarted();

    if (recordedChunks.length === 0) {
      showError('Nenhum dado gravado.');
      notifyError('Nenhum dado gravado.');
      cleanup();
      return;
    }

    const blobType = recordedChunks[0]?.type || mimeType;
    const blob = new Blob(recordedChunks, { type: blobType });

    if (blob.size < 100) {
      showError('Gravação vazia ou corrompida.');
      notifyError('Gravação vazia ou corrompida.');
      cleanup();
      return;
    }

    await uploadRecording(blob);
    cleanup();
  };

  mediaRecorder.start(1000);

  // Update UI
  startTime = Date.now();
  initStatus.classList.add('hidden');
  recordingView.classList.remove('hidden');
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
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
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
      showError('Sessão expirada. Faça login novamente.');
      notifyError('Sessão expirada. Faça login novamente.');
      return;
    }

    const ext = 'webm';
    const formData = new FormData();
    formData.append('file', blob, `recording-${Date.now()}.${ext}`);
    formData.append('title', meetingData.title || 'Gravação via Extensão');
    formData.append('meeting_type', meetingData.meetingType || 'empresa');
    formData.append('lead_name', meetingData.leadName || '');
    formData.append('lead_company', meetingData.leadCompany || '');
    formData.append('lead_email', meetingData.leadEmail || '');

    console.log('Uploading, blob size:', blob.size);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
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

    showStatus('success', '✅ Gravação enviada! Fechando...');
    chrome.runtime.sendMessage({ action: 'uploadComplete', meetingId: result.meetingId }).catch(() => {});

    setTimeout(() => window.close(), 3000);
  } catch (err) {
    console.error('Upload error:', err);
    showError(err.message);
    notifyError(err.message);
    setTimeout(() => window.close(), 6000);
  }
}

// ── UI helpers ──

function showStatus(type, text) {
  statusMsg.className = `status ${type}`;
  statusMsg.textContent = text;
  statusMsg.classList.remove('hidden');
}

function showError(text) {
  showStatus('error', '❌ ' + text);
  chrome.storage.local.set({ recordingState: 'error', uploadError: text });
}

function notifyError(error) {
  chrome.runtime.sendMessage({ action: 'captureError', error }).catch(() => {});
}

function notifyUploadStarted() {
  chrome.runtime.sendMessage({ action: 'uploadStarted' }).catch(() => {});
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
