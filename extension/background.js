// Sales Coach - Background Service Worker

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