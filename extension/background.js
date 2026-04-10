// Sales Coach AI - Background Service Worker

function setBadge(text, color = '#FF0000') {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Restore badge on startup
chrome.storage.local.get(['recordingState'], (data) => {
  if (data.recordingState === 'recording') setBadge('REC');
  else if (data.recordingState === 'uploading' || data.recordingState === 'stopping') setBadge('...', '#FF8800');
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'recordingStarted') {
    setBadge('REC');
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
  if (msg.action === 'stopCapture') {
    // Forward stop to all tabs
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' }).catch(() => {});
      }
    });
  }
});