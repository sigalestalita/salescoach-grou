// Sales Coach AI - Chrome Extension Popup

let timerInterval = null;
let startTime = null;

// ── DOM refs ──
const loginSection = document.getElementById('login-section');
const recordingSection = document.getElementById('recording-section');
const formSection = document.getElementById('form-section');
const activeRecording = document.getElementById('active-recording');
const statusDot = document.getElementById('status-dot');
const uploadStatus = document.getElementById('upload-status');
const screenStatus = document.getElementById('screen-status');

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (session) {
    showRecordingUI();
    await restoreState();
  } else {
    showLoginUI();
  }
});

async function restoreState() {
  const data = await chrome.storage.local.get([
    'recordingState',
    'recordingStartTime',
    'recordingMode',
    'uploadError',
    'lastMeetingId',
    'isScreenSharing',
  ]);
  const state = data.recordingState || 'idle';
  const mode = data.recordingMode || (data.isScreenSharing ? 'screen_audio' : 'audio_only');

  if (state === 'recording') {
    startTime = data.recordingStartTime || Date.now();
    showActiveRecording(mode);
  } else if (state === 'stopping' || state === 'uploading') {
    showUploadingState();
  } else if (state === 'done') {
    showDoneState();
  } else if (state === 'error') {
    showErrorState(data.uploadError || 'Erro desconhecido');
  }
}

// ── Auth ──
async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['accessToken', 'refreshToken', 'userId'], (data) => {
      if (data.accessToken && data.userId) {
        resolve(data);
      } else {
        resolve(null);
      }
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
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || data.msg || 'Erro ao fazer login');
    }

    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user.id,
      userEmail: email,
    });

    errorEl.classList.add('hidden');
    showRecordingUI();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userId', 'userEmail']);
  showLoginUI();
});

// ── UI states ──
function showLoginUI() {
  loginSection.classList.remove('hidden');
  recordingSection.classList.add('hidden');
  statusDot.classList.add('offline');
}

function showRecordingUI() {
  loginSection.classList.add('hidden');
  recordingSection.classList.remove('hidden');
  statusDot.classList.remove('offline');
  formSection.classList.remove('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.add('hidden');
  uploadStatus.textContent = '';
  screenStatus.textContent = '🖥 Tela + 🎙 Áudio';
  screenStatus.className = 'screen-status sharing';
}

function showPendingStartState(message) {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status sending';
  uploadStatus.textContent = message;
  stopTimer();
}

function showActiveRecording(mode = 'screen_audio') {
  formSection.classList.add('hidden');
  activeRecording.classList.remove('hidden');
  uploadStatus.classList.add('hidden');

  if (mode === 'audio_only') {
    screenStatus.textContent = '🎙 Apenas áudio';
    screenStatus.className = 'screen-status';
  } else {
    screenStatus.textContent = '🖥 Tela + 🎙 Áudio';
    screenStatus.className = 'screen-status sharing';
  }

  startTimer();
}

function showUploadingState() {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status sending';
  uploadStatus.textContent = '⏳ Enviando gravação ao sistema...';
  stopTimer();
}

function showDoneState() {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status success';
  uploadStatus.textContent = '✅ Gravação enviada! A análise será processada automaticamente.';
  stopTimer();
  setTimeout(async () => {
    await chrome.storage.local.set({ recordingState: 'idle' });
    await chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'lastMeetingId', 'uploadError', 'isScreenSharing']);
    showRecordingUI();
  }, 5000);
}

function showErrorState(errorMsg) {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status error';
  uploadStatus.textContent = '❌ Erro: ' + errorMsg;
  stopTimer();
  setTimeout(async () => {
    await chrome.storage.local.set({ recordingState: 'idle' });
    await chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'uploadError', 'isScreenSharing']);
    showRecordingUI();
  }, 8000);
}

function getPermissionErrorMessage(err) {
  const message = err?.message || '';

  if (err?.name === 'NotAllowedError' || /permission dismissed/i.test(message)) {
    return 'Permissão de microfone dispensada. Clique em Permitir no navegador e tente novamente.';
  }

  if (err?.name === 'NotFoundError') {
    return 'Nenhum microfone foi encontrado.';
  }

  return message || 'Erro ao solicitar acesso ao microfone.';
}

async function ensureMicrophoneAccess() {
  let tempStream = null;

  try {
    tempStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    throw new Error(getPermissionErrorMessage(err));
  } finally {
    if (tempStream) {
      tempStream.getTracks().forEach((track) => track.stop());
    }
  }
}

// ── Recording ──
document.getElementById('btn-start').addEventListener('click', async () => {
  const title = document.getElementById('meeting-title').value.trim();
  if (!title) {
    alert('Preencha o título da agenda');
    return;
  }

  const meetingData = {
    title,
    meetingType: document.getElementById('meeting-type').value,
    leadName: document.getElementById('lead-name').value.trim(),
    leadCompany: document.getElementById('lead-company').value.trim(),
    leadEmail: document.getElementById('lead-email').value.trim(),
  };

  try {
    showPendingStartState('🎙 Autorize o microfone para continuar...');
    await ensureMicrophoneAccess();
    await chrome.storage.local.set({ meetingData });
  } catch (err) {
    await chrome.storage.local.set({ recordingState: 'error', uploadError: err.message });
    showErrorState(err.message);
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs.length > 0 ? tabs[0].id : null;

  if (!tabId) {
    showErrorState('Erro: nenhuma aba ativa encontrada.');
    return;
  }

  showPendingStartState('🖥 Selecione a tela na janela do navegador para iniciar...');
  chrome.runtime.sendMessage({ action: 'startFullRecording', tabId }, (response) => {
    if (chrome.runtime.lastError) {
      showErrorState('Erro ao iniciar gravação: ' + chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showErrorState(response?.error || 'Erro ao iniciar gravação.');
    }
  });
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  stopTimer();
  await chrome.storage.local.set({ recordingState: 'stopping' });
  showUploadingState();

  chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
    if (!response || !response.success) {
      showErrorState(response?.error || 'Erro ao parar gravação');
    }
  });
});

// Listen for messages from background/offscreen
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'recordingStarted') {
    startTime = msg.startTime || Date.now();
    showActiveRecording(msg.mode || 'screen_audio');
  }

  if (msg.action === 'captureError') {
    stopTimer();
    chrome.storage.local.set({ recordingState: 'error', uploadError: msg.error || 'Erro na gravação.' });
    chrome.storage.local.remove(['recordingStartTime', 'isScreenSharing', 'recordingMode']);
    showErrorState(msg.error || 'Erro na gravação.');
  }

  if (msg.action === 'screenShareStarted') {
    // no-op, screen is always on
  }

  if (msg.action === 'screenShareError') {
    // no-op
  }

  if (msg.action === 'uploadStarted') {
    showUploadingState();
  }

  if (msg.action === 'uploadComplete') {
    showDoneState();
  }

  if (msg.action === 'uploadError') {
    showErrorState(msg.error || 'Erro desconhecido');
  }
});

// ── Timer ──
function startTimer() {
  stopTimer();
  const timerEl = document.getElementById('timer');
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    timerEl.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
