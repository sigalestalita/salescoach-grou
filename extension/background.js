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
    // Already exists
    if (!e.message.includes('already exists')) {
      throw e;
    }
    offscreenCreated = true;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startCapture') {
    handleStartCapture(sendResponse);
    return true; // async response
  }

  if (msg.action === 'stopCapture') {
    handleStopCapture(sendResponse);
    return true;
  }

  if (msg.action === 'recordingComplete') {
    // Forward blob URL to popup
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

async function handleStartCapture(sendResponse) {
  try {
    // Use desktopCapture to let user choose what to share
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      async (streamId, options) => {
        if (!streamId) {
          sendResponse({ success: false, error: 'Captura cancelada pelo usuário' });
          return;
        }

        try {
          await ensureOffscreen();

          // Send stream ID to offscreen document to start recording
          chrome.runtime.sendMessage({
            action: 'startRecording',
            target: 'offscreen',
            streamId,
            options,
          });

          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
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
