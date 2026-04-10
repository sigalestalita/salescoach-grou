// Sales Coach AI - Popup
// Handles: login, meeting form, recording state display.
// On "Start": injects content script into active tab for recording.

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

let timerInterval = null;
let startTime = null;

const loginSection = document.getElementById('login-section');
const recordingSection = document.getElementById('recording-section');
const formSection = document.getElementById('form-section');
const activeRecording = document.getElementById('active-recording');
const statusDot = document.getElementById('status-dot');
const uploadStatus = document.getElementById('upload-status');
const screenStatus = document.getElementById('screen-status');

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
    'recordingState', 'recordingStartTime', 'recordingMode', 'uploadError',
  ]);
  const state = data.recordingState || 'idle';

  if (state === 'recording') {
    startTime = data.recordingStartTime || Date.now();
    showActiveRecording(data.recordingMode || 'screen_audio');
  } else if (state === 'stopping' || state === 'uploading') {
    showUploadingState();
  } else if (state === 'done') {
    showDoneState();
  } else if (state === 'error') {
    showErrorState(data.uploadError || 'Erro desconhecido');
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

// ── UI ──
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
}

function showActiveRecording(mode) {
  formSection.classList.add('hidden');
  activeRecording.classList.remove('hidden');
  uploadStatus.classList.add('hidden');
  screenStatus.textContent = mode === 'audio_only' ? '🎙 Apenas áudio' : '🖥 Tela + 🎙 Áudio';
  startTimer();
}

function showUploadingState() {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status sending';
  uploadStatus.textContent = '⏳ Enviando gravação...';
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
    await chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'uploadError']);
    showRecordingUI();
  }, 5000);
}

function showErrorState(msg) {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status error';
  uploadStatus.textContent = '❌ ' + msg;
  stopTimer();
  setTimeout(async () => {
    await chrome.storage.local.set({ recordingState: 'idle' });
    await chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'uploadError']);
    showRecordingUI();
  }, 8000);
}

// ── Start Recording ──
document.getElementById('btn-start').addEventListener('click', async () => {
  const title = document.getElementById('meeting-title').value.trim();
  if (!title) { alert('Preencha o título da agenda'); return; }

  const meetingData = {
    title,
    meetingType: document.getElementById('meeting-type').value,
    leadName: document.getElementById('lead-name').value.trim(),
    leadCompany: document.getElementById('lead-company').value.trim(),
    leadEmail: document.getElementById('lead-email').value.trim(),
  };
  await chrome.storage.local.set({ meetingData });

  // Inject the content script into the active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada');

    // Inject CSS + JS into the active tab
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });

    // Tell the content script to start recording
    await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });

    // Close the popup — the overlay in the tab handles everything now
    window.close();
  } catch (err) {
    console.error('Failed to inject content script:', err);
    showErrorState('Erro ao iniciar: ' + err.message);
  }
});

// ── Stop (from popup if reopened) ──
document.getElementById('btn-stop').addEventListener('click', async () => {
  stopTimer();
  await chrome.storage.local.set({ recordingState: 'stopping' });
  showUploadingState();

  // Send stop to all tabs that might have the content script
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' }).catch(() => {});
  }
});

// ── Listen for state updates ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'recordingStarted') {
    startTime = msg.startTime || Date.now();
    showActiveRecording(msg.mode || 'screen_audio');
  }
  if (msg.action === 'uploadStarted') showUploadingState();
  if (msg.action === 'uploadComplete') showDoneState();
  if (msg.action === 'uploadError' || msg.action === 'captureError') {
    showErrorState(msg.error || 'Erro na gravação');
  }
});

// ── Timer ──
function startTimer() {
  stopTimer();
  const el = document.getElementById('timer');
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}