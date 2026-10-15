// Sales Coach - Background Service Worker

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';
const APP_URL = 'https://salescoach.grougp.com.br';

function setBadge(text, color = '#F06B5E') {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Restore badge on startup
chrome.storage.local.get(['recordingState'], (data) => {
  if (data.recordingState === 'recording') setBadge('REC');
  else if (data.recordingState === 'uploading' || data.recordingState === 'stopping') setBadge('...', '#15498D');
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((msg, sender) => {
  // O cartão "Gravar esta reunião?" (autodetect.js) pede o gravador na própria aba.
  if (msg.action === 'injectRecorder' && sender.tab?.id) {
    const target = { tabId: sender.tab.id };
    chrome.scripting.insertCSS({ target, files: ['content.css'] })
      .then(() => chrome.scripting.executeScript({ target, files: ['content.js'] }))
      .catch((err) => console.error('Sales Coach: falha ao iniciar o gravador', err));
  }
  // Sem login na extensão: abre o Sales Coach, que entrega a sessão sozinho.
  if (msg.action === 'openApp') {
    chrome.tabs.create({ url: `${APP_URL}/agendas` });
  }
  if (msg.action === 'recordingStarted') {
    setBadge('REC');
  }
  if (msg.action === 'uploadStarted') {
    setBadge('...', '#15498D');
  }
  if (msg.action === 'uploadComplete') {
    setBadge('');
  }
  if (msg.action === 'uploadError' || msg.action === 'captureError') {
    setBadge('');
  }
  if (msg.action === 'stopCapture') {
    // Forward stop to all tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' }).catch(() => {});
      }
    });
  }
});

// ── Login automático pelo site ──
// Quem está logado no Sales Coach neste navegador não precisa entrar de novo
// na extensão. O site (e só ele: ver externally_connectable no manifesto) pede
// ao servidor um código de uso único para o mesmo usuário e o entrega aqui; a
// extensão troca o código por uma sessão própria, independente da do site.

function fromSalesCoach(sender) {
  try {
    const host = new URL(sender.url || sender.origin).hostname;
    return host === 'grougp.com.br' || host.endsWith('.grougp.com.br');
  } catch {
    return false;
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!fromSalesCoach(sender)) return;

  if (msg?.type === 'salescoach:status') {
    chrome.storage.local.get(['userId'], ({ userId }) => {
      sendResponse({ installed: true, version: chrome.runtime.getManifest().version, userId: userId || null });
    });
    return true;
  }

  if (msg?.type === 'salescoach:session' && typeof msg.tokenHash === 'string') {
    connectWithTokenHash(msg.tokenHash)
      .then((userId) => sendResponse({ ok: true, userId }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function connectWithTokenHash(tokenHash) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token || !data.user?.id) {
    throw new Error(data.error_description || data.msg || `Falha ao conectar (status ${res.status})`);
  }
  await chrome.storage.local.set({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user.id,
    userEmail: data.user.email || '',
  });
  return data.user.id;
}
