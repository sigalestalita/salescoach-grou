// Sales Coach - Popup
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
  let state = data.recordingState || 'idle';

  // O estado salvo pode ter ficado para trás: a aba recarregou ou fechou no
  // meio do envio, ou a extensão foi atualizada durante a reunião (o gravador
  // antigo perde o acesso ao armazenamento e não avisa o fim). Sem conferir,
  // o popup ficava preso em "Enviando gravação…" para sempre.
  if ((state === 'recording' || state === 'stopping' || state === 'uploading') && !(await gravacaoViva())) {
    await chrome.storage.local.set({ recordingState: 'idle' });
    await chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'uploadError']);
    try { chrome.action.setBadgeText({ text: '' }); } catch {}
    state = 'idle';
  }

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

/** Alguma aba tem um gravador desta extensão gravando ou enviando agora? */
async function gravacaoViva() {
  try {
    const tabs = await chrome.tabs.query({});
    const perguntar = (tab) => Promise.race([
      chrome.tabs.sendMessage(tab.id, { action: 'status' }).catch(() => null),
      new Promise((r) => setTimeout(() => r(null), 1500)),
    ]);
    const respostas = await Promise.all(tabs.map(perguntar));
    return respostas.some((r) => r && (r.recording || r.uploading || r.starting));
  } catch {
    return true; // na dúvida, não mexe no estado
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

// Abre o Sales Coach: logado lá, o site entrega a sessão para a extensão.
document.getElementById('btn-open-app').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openApp' });
  window.close();
});

// Se a sessão chegar pelo site com o popup aberto, troca de tela.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.userId?.newValue && !loginSection.classList.contains('hidden')) showRecordingUI();
});

// ── Agenda ──
// Aberto numa reunião do Meet ou do Teams, o popup traz da agenda conectada o
// título e o lead. Só preenche campo vazio: o que o vendedor digitou fica.
let calendarEvent = null;
const MEETING_HOSTS = ['meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'];
async function prefillFromCalendar() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !MEETING_HOSTS.includes(new URL(tab.url).hostname)) return;
    const res = await chrome.runtime.sendMessage({ action: 'calendarLookup', meetingUrl: tab.url, title: tab.title });
    if (!res?.event) return;
    calendarEvent = { ...res.event, meetingUrl: tab.url };
    const fill = (id, value) => {
      const el = document.getElementById(id);
      if (el && !el.value.trim() && value) el.value = value;
    };
    fill('meeting-title', res.event.title);
    fill('lead-name', res.event.lead?.name);
    fill('lead-email', res.event.lead?.email);
  } catch (err) {
    console.warn('Sales Coach: agenda indisponível', err);
  }
}

// ── Sugestão automática ao entrar numa reunião ──
const autoDetectEl = document.getElementById('auto-detect');
async function loadAutoDetect() {
  const { autoDetect } = await chrome.storage.local.get(['autoDetect']);
  autoDetectEl.checked = autoDetect !== false;
}
// Gravar a tela é opcional: por padrão a extensão grava só o áudio (leve; a
// voz do cliente vem da chamada). A escolha fica lembrada.
const gravarTelaEl = document.getElementById('gravar-tela');
(async () => {
  const { gravarTela } = await chrome.storage.local.get(['gravarTela']);
  gravarTelaEl.checked = gravarTela === true;
})();
gravarTelaEl.addEventListener('change', () => {
  chrome.storage.local.set({ gravarTela: gravarTelaEl.checked });
});
autoDetectEl.addEventListener('change', () => {
  chrome.storage.local.set({ autoDetect: autoDetectEl.checked });
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
  loadAutoDetect();
  prefillFromCalendar();
  loginSection.classList.add('hidden');
  recordingSection.classList.remove('hidden');
  statusDot.classList.remove('offline');
  formSection.classList.remove('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.add('hidden');
  loadMeetingTypes();
}

// Os tipos de reunião são configurados por empresa; a RLS já devolve apenas os
// da organização do usuário logado.
async function loadMeetingTypes() {
  const select = document.getElementById('meeting-type');
  if (!select) return;

  const { accessToken } = await chrome.storage.local.get(['accessToken']);
  if (!accessToken) return;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/meeting_types?select=key,label&is_active=eq.true&order=sort_order`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const types = await res.json();
    select.innerHTML = '';
    // O cartão que aparece ao entrar numa reunião usa a mesma lista.
    if (Array.isArray(types)) chrome.storage.local.set({ meetingTypesCache: types });

    if (!Array.isArray(types) || types.length === 0) {
      select.innerHTML = '<option value="">Sem tipos configurados</option>';
      return;
    }

    for (const type of types) {
      const option = document.createElement('option');
      option.value = type.key;
      option.textContent = type.label;
      select.appendChild(option);
    }
  } catch (err) {
    console.error('Falha ao carregar tipos de reunião:', err);
    select.innerHTML = '<option value="">Não foi possível carregar</option>';
  }
}

function showActiveRecording(mode) {
  formSection.classList.add('hidden');
  activeRecording.classList.remove('hidden');
  uploadStatus.classList.add('hidden');
  screenStatus.textContent = mode === 'coach' ? 'Só dicas ao vivo (o robô grava)' : mode === 'audio_only' ? 'Apenas áudio' : 'Tela + áudio';
  startTimer();
}

function showUploadingState() {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status sending';
  uploadStatus.textContent = 'Enviando gravação…';
  stopTimer();
}

function showDoneState() {
  formSection.classList.add('hidden');
  activeRecording.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  uploadStatus.className = 'status success';
  uploadStatus.textContent = 'Gravação enviada. A análise começa automaticamente.';
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
  uploadStatus.textContent = msg;
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
    meetingUrl: calendarEvent?.meetingUrl || null,
    calendarEventId: calendarEvent?.eventId || null,
    attendees: calendarEvent?.attendees || [],
    gravarTela: gravarTelaEl.checked,
  };
  await chrome.storage.local.set({ meetingData, gravarTela: gravarTelaEl.checked });

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
  if (msg.action === 'coachStarted') {
    startTime = msg.startTime || Date.now();
    showActiveRecording('coach');
  }
  // Fim das dicas ao vivo: não há envio, o robô manda a gravação.
  if (msg.action === 'coachEnded') {
    stopTimer();
    showRecordingUI();
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