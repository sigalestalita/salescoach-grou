// Sales Coach AI - Chrome Extension Popup

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

let timerInterval = null;
let startTime = null;

// ── DOM refs ──
const loginSection = document.getElementById('login-section');
const recordingSection = document.getElementById('recording-section');
const formSection = document.getElementById('form-section');
const activeRecording = document.getElementById('active-recording');
const statusDot = document.getElementById('status-dot');
const uploadStatus = document.getElementById('upload-status');

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (session) {
    showRecordingUI();
  } else {
    showLoginUI();
  }

  // Check if already recording
  chrome.storage.local.get(['isRecording', 'recordingStartTime'], (data) => {
    if (data.isRecording) {
      startTime = data.recordingStartTime;
      showActiveRecording();
    }
  });
});

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
  const appUrl = document.getElementById('app-url').value.trim() || 'https://salescoach-grou.lovable.app';
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
      appUrl,
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

// ── UI toggles ──
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

function showActiveRecording() {
  formSection.classList.add('hidden');
  activeRecording.classList.remove('hidden');
  uploadStatus.classList.add('hidden');
  startTimer();
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

  // Save meeting data
  await chrome.storage.local.set({ meetingData });

  // Request desktop capture from background
  chrome.runtime.sendMessage({ action: 'startCapture' }, (response) => {
    if (response && response.success) {
      startTime = Date.now();
      chrome.storage.local.set({ isRecording: true, recordingStartTime: startTime });
      showActiveRecording();
    } else {
      alert(response?.error || 'Erro ao iniciar gravação. Tente novamente.');
    }
  });
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  stopTimer();

  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status sending';
  uploadStatus.textContent = '⏳ Parando gravação e enviando...';
  activeRecording.classList.add('hidden');

  chrome.runtime.sendMessage({ action: 'stopCapture' }, async (response) => {
    if (response && response.success && response.blob) {
      await uploadRecording(response.blob);
    } else if (response && response.success) {
      // Blob will come via a separate message
      uploadStatus.textContent = '⏳ Processando gravação...';
    } else {
      uploadStatus.className = 'status error';
      uploadStatus.textContent = '❌ Erro ao parar gravação: ' + (response?.error || 'desconhecido');
    }
  });
});

// Listen for recording blob from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'recordingReady' && msg.blobUrl) {
    handleRecordingBlob(msg.blobUrl);
  }
});

async function handleRecordingBlob(blobUrl) {
  try {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    await uploadRecording(blob);
  } catch (err) {
    uploadStatus.className = 'status error';
    uploadStatus.textContent = '❌ Erro ao processar gravação: ' + err.message;
  }
}

async function uploadRecording(blob) {
  uploadStatus.className = 'status sending';
  uploadStatus.textContent = '⏳ Enviando gravação... (0%)';

  try {
    const session = await getSession();
    const meetingData = await new Promise((resolve) => {
      chrome.storage.local.get(['meetingData'], (d) => resolve(d.meetingData || {}));
    });

    const formData = new FormData();
    formData.append('file', blob, `recording-${Date.now()}.webm`);
    formData.append('title', meetingData.title || 'Gravação via Extensão');
    formData.append('meeting_type', meetingData.meetingType || 'empresa');
    formData.append('lead_name', meetingData.leadName || '');
    formData.append('lead_company', meetingData.leadCompany || '');
    formData.append('lead_email', meetingData.leadEmail || '');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Erro no upload');
    }

    uploadStatus.className = 'status success';
    uploadStatus.textContent = '✅ Gravação enviada! A análise será processada automaticamente.';

    await chrome.storage.local.remove(['isRecording', 'recordingStartTime', 'meetingData']);

    setTimeout(() => showRecordingUI(), 5000);
  } catch (err) {
    uploadStatus.className = 'status error';
    uploadStatus.textContent = '❌ Erro no envio: ' + err.message;
  }
}

// ── Timer ──
function startTimer() {
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
