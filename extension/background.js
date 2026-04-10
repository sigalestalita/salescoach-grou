// Sales Coach AI - Background Service Worker

let recorderWindowId = null;

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

// Track recorder window closing
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === recorderWindowId) {
    recorderWindowId = null;
    // If recording was active, it means user closed the window — treat as stop
    chrome.storage.local.get(['recordingState'], (data) => {
      if (data.recordingState === 'recording') {
        // The recorder.js will handle cleanup before the window closes
        // But if it didn't finish uploading, reset state
        setTimeout(() => {
          chrome.storage.local.get(['recordingState'], (d) => {
            if (d.recordingState === 'recording') {
              chrome.storage.local.set({ recordingState: 'idle' });
              chrome.storage.local.remove(['recordingStartTime', 'recordingMode', 'isScreenSharing']);
              setBadge('');
            }
          });
        }, 2000);
      }
    });
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openRecorder') {
    openRecorderWindow(sendResponse);
    return true;
  }

  if (msg.action === 'stopCapture') {
    handleStopCapture(sendResponse);
    return true;
  }

  if (msg.action === 'recordingStarted') {
    setBadge('REC');
    // Relay to popup
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  if (msg.action === 'uploadStarted') {
    setBadge('...', '#FF8800');
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  if (msg.action === 'uploadComplete') {
    setBadge('');
    recorderWindowId = null;
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  if (msg.action === 'uploadError' || msg.action === 'captureError') {
    setBadge('');
    recorderWindowId = null;
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});

async function openRecorderWindow(sendResponse) {
  try {
    // If recorder window already exists, focus it
    if (recorderWindowId) {
      try {
        await chrome.windows.update(recorderWindowId, { focused: true });
        sendResponse({ success: true });
        return;
      } catch {
        recorderWindowId = null;
      }
    }

    const win = await chrome.windows.create({
      url: chrome.runtime.getURL('recorder.html'),
      type: 'popup',
      width: 420,
      height: 320,
      focused: true,
    });

    recorderWindowId = win.id;
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStopCapture(sendResponse) {
  try {
    // Send stop message to all extension pages (the recorder window will pick it up)
    chrome.runtime.sendMessage({ action: 'stopRecording' }).catch(() => {});
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
