// Sales Coach AI - Background Service Worker

let offscreenCreated = false;

function setBadge(text, color = '#FF0000') {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Restore badge on service worker startup
chrome.storage.local.get(['recordingState'], (data) => {
  if (data.recordingState === 'recording') {
    setBadge('REC');
  } else if (data.recordingState === 'uploading' || data.recordingState === 'stopping') {
    setBadge('...', '#FF8800');
  }
});

// Ensure offscreen document exists
async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
      justification: 'Recording audio and screen for meeting analysis',
    });
    offscreenCreated = true;
  } catch (e) {
    if (!e.message.includes('already exists')) {
      throw e;
    }
    offscreenCreated = true;
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startMicRecording') {
    handleStartMicRecording(sendResponse);
    return true;
  }

  if (msg.action === 'startFullRecording') {
    handleStartFullRecording(msg, sendResponse);
    return true;
  }

  if (msg.action === 'startScreenShare') {
    handleStartScreenShare(msg, sendResponse);
    return true;
  }

  if (msg.action === 'stopCapture') {
    handleStopCapture(sendResponse);
    return true;
  }

  if (msg.action === 'uploadStarted') {
    setBadge('...', '#FF8800');
  }

  if (msg.action === 'uploadComplete') {
    setBadge('');
  }

  if (msg.action === 'uploadError' || msg.action === 'captureError') {
    setBadge('');
  }

  if (msg.action === 'screenShareStarted') {
    // badge stays REC
  }

  if (msg.action === 'offscreenClosed') {
    offscreenCreated = false;
    return false;
  }

  // Storage proxy for offscreen document (Arc browser compatibility)
  if (msg.action === 'storageSet') {
    chrome.storage.local.set(msg.data);
    return false;
  }

  if (msg.action === 'storageGet') {
    chrome.storage.local.get(msg.keys, (result) => {
      sendResponse(result);
    });
    return true; // async response
  }

  if (msg.action === 'storageRemove') {
    chrome.storage.local.remove(msg.keys);
    return false;
  }
});

async function handleStartMicRecording(sendResponse) {
  try {
    await ensureOffscreen();

    chrome.runtime.sendMessage({
      action: 'startMicRecording',
      target: 'offscreen',
    });

    setBadge('REC');
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStartFullRecording(msg, sendResponse) {
  const tabId = msg.tabId;
  if (!tabId) {
    sendResponse({ success: false, error: 'Tab ID não fornecido' });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    sendResponse({ success: true });

    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      tab,
      async (streamId) => {
        if (!streamId) {
          chrome.runtime.sendMessage({ action: 'captureError', error: 'Compartilhamento de tela cancelado.' });
          chrome.storage.local.set({ recordingState: 'idle' });
          chrome.storage.local.remove(['recordingStartTime', 'isScreenSharing', 'recordingMode']);
          return;
        }

        try {
          await ensureOffscreen();
          chrome.runtime.sendMessage({
            action: 'startFullRecording',
            target: 'offscreen',
            streamId,
          });
          setBadge('REC');
        } catch (err) {
          chrome.runtime.sendMessage({ action: 'captureError', error: err.message });
        }
      }
    );
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStartScreenShare(msg, sendResponse) {
  const tabId = msg.tabId;

  if (!tabId) {
    sendResponse({ success: false, error: 'Tab ID não fornecido' });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);

    // Respond immediately so popup knows the selector is opening
    sendResponse({ success: true });

    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      tab,
      async (streamId) => {
        if (!streamId) {
          chrome.runtime.sendMessage({ action: 'screenShareError', error: 'Compartilhamento cancelado.' });
          return;
        }

        try {
          await ensureOffscreen();

          chrome.runtime.sendMessage({
            action: 'addScreenShare',
            target: 'offscreen',
            streamId,
          });
        } catch (err) {
          chrome.runtime.sendMessage({ action: 'screenShareError', error: err.message });
        }
      }
    );
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStopCapture(sendResponse) {
  try {
    chrome.runtime.sendMessage({
      action: 'stopRecording',
      target: 'offscreen',
    });
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
