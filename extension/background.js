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

// Open recorder window when extension icon is clicked (no popup)
chrome.action.onClicked.addListener(() => {
  openRecorderWindow();
});

// Track recorder window closing
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === recorderWindowId) {
    recorderWindowId = null;
    chrome.storage.local.get(['recordingState'], (data) => {
      if (data.recordingState === 'recording') {
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
    openRecorderWindow();
    sendResponse({ success: true });
    return true;
  }

  if (msg.action === 'stopCapture') {
    chrome.runtime.sendMessage({ action: 'stopRecording' }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }

  if (msg.action === 'recordingStarted') {
    setBadge('REC');
  }

  if (msg.action === 'uploadStarted') {
    setBadge('...', '#FF8800');
  }

  if (msg.action === 'uploadComplete') {
    setBadge('');
    recorderWindowId = null;
  }

  if (msg.action === 'uploadError' || msg.action === 'captureError') {
    setBadge('');
    recorderWindowId = null;
  }
});

async function openRecorderWindow() {
  // If recorder window already exists, focus it
  if (recorderWindowId) {
    try {
      await chrome.windows.update(recorderWindowId, { focused: true });
      return;
    } catch {
      recorderWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('recorder.html'),
    type: 'popup',
    width: 400,
    height: 580,
    focused: true,
  });

  recorderWindowId = win.id;
}