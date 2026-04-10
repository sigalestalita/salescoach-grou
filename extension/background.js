// Sales Coach AI - Background Service Worker

let offscreenCreated = false;

// Ensure offscreen document exists
async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording screen and audio for meeting analysis',
    });
    offscreenCreated = true;
  } catch (e) {
    if (!e.message.includes('already exists')) {
      throw e;
    }
    offscreenCreated = true;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startCapture') {
    handleStartCapture(msg, sendResponse);
    return true; // async response
  }

  if (msg.action === 'stopCapture') {
    handleStopCapture(sendResponse);
    return true;
  }

  if (msg.action === 'recordingComplete') {
    chrome.runtime.sendMessage({
      action: 'recordingReady',
      blobUrl: msg.blobUrl,
    });
    sendResponse({ success: true });
    return false;
  }

  if (msg.action === 'offscreenClosed') {
    offscreenCreated = false;
    return false;
  }
});

async function handleStartCapture(msg, sendResponse) {
  const tabId = msg.tabId;

  if (!tabId) {
    sendResponse({ success: false, error: 'Tab ID não fornecido' });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);

    // Respond immediately so the popup knows the selector is opening
    sendResponse({ success: true });

    // chooseDesktopMedia requires the tab object as second param in MV3
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      tab,
      async (streamId) => {
        if (!streamId) {
          // User cancelled the selector
          chrome.runtime.sendMessage({ action: 'captureError', error: 'Captura cancelada pelo usuário' });
          return;
        }

        try {
          await ensureOffscreen();

          // Send stream ID to offscreen document to start recording
          chrome.runtime.sendMessage({
            action: 'startRecording',
            target: 'offscreen',
            streamId,
          });

          chrome.runtime.sendMessage({ action: 'captureStarted' });
        } catch (err) {
          chrome.runtime.sendMessage({ action: 'captureError', error: err.message });
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
