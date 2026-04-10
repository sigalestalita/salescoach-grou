// Sales Coach AI - Offscreen Recording Document

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

let mediaRecorder = null;
let recordedChunks = [];
let micStream = null;
let screenStream = null;
let audioContext = null;
let mixedDest = null;
let currentCombinedStream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'startMicRecording') {
    startMicOnlyRecording();
  }

  if (msg.action === 'addScreenShare') {
    addScreenShare(msg.streamId);
  }

  if (msg.action === 'stopRecording') {
    stopRecording();
  }
});

async function setState(state, extras = {}) {
  await chrome.storage.local.set({ recordingState: state, ...extras });
}

async function startMicOnlyRecording() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    // Set up audio context for mixing (will add screen audio later if needed)
    audioContext = new AudioContext();
    mixedDest = audioContext.createMediaStreamDestination();

    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(mixedDest);

    // Start with audio-only recording
    currentCombinedStream = new MediaStream([
      ...mixedDest.stream.getAudioTracks(),
    ]);

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(currentCombinedStream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      await setState('stopping');
      chrome.runtime.sendMessage({ action: 'uploadStarted' });

      const mimeType = recordedChunks[0]?.type || 'audio/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      await uploadFromOffscreen(blob);

      cleanup();
    };

    mediaRecorder.start(1000);
    await setState('recording');
    console.log('Mic-only recording started');
  } catch (err) {
    console.error('Failed to start mic recording:', err);
    await setState('error', { uploadError: 'Permissão de microfone negada. Verifique as configurações do navegador.' });
    chrome.runtime.sendMessage({
      action: 'captureError',
      error: 'Permissão de microfone negada.',
    });
  }
}

async function addScreenShare(streamId) {
  try {
    screenStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 15,
        },
      },
    });

    // Add system audio to the mix
    const systemAudioTracks = screenStream.getAudioTracks();
    if (systemAudioTracks.length > 0 && audioContext && mixedDest) {
      const systemSource = audioContext.createMediaStreamSource(
        new MediaStream(systemAudioTracks)
      );
      systemSource.connect(mixedDest);
    }

    // Stop current recorder, keep chunks
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      // Wait for the stop event to fire and collect remaining chunks
      await new Promise(resolve => {
        const origOnStop = mediaRecorder.onstop;
        mediaRecorder.onstop = (e) => {
          // Don't upload yet, just collect chunks
          resolve();
        };
      });
    }

    // Create new combined stream with video + mixed audio
    currentCombinedStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...mixedDest.stream.getAudioTracks(),
    ]);

    // Start new recorder with video+audio
    mediaRecorder = new MediaRecorder(currentCombinedStream, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 1000000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      await setState('stopping');
      chrome.runtime.sendMessage({ action: 'uploadStarted' });

      const mimeType = recordedChunks[0]?.type || 'video/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      await uploadFromOffscreen(blob);

      cleanup();
    };

    mediaRecorder.start(1000);
    await chrome.storage.local.set({ isScreenSharing: true });
    chrome.runtime.sendMessage({ action: 'screenShareStarted' });
    console.log('Screen share added to recording');
  } catch (err) {
    console.error('Failed to add screen share:', err);
    chrome.runtime.sendMessage({
      action: 'screenShareError',
      error: err.message,
    });
  }
}

function cleanup() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  mixedDest = null;
  currentCombinedStream = null;
  recordedChunks = [];
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log('Recording stopped');
  }
}

async function refreshAccessToken() {
  try {
    const data = await chrome.storage.local.get(['refreshToken']);
    if (!data.refreshToken) return null;

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: data.refreshToken }),
    });

    if (!res.ok) return null;

    const result = await res.json();
    await chrome.storage.local.set({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    });
    console.log('Token refreshed successfully');
    return result.access_token;
  } catch (err) {
    console.error('Token refresh failed:', err);
    return null;
  }
}

async function uploadFromOffscreen(blob) {
  await setState('uploading');

  try {
    const data = await chrome.storage.local.get(['accessToken', 'refreshToken', 'meetingData']);
    let accessToken = data.accessToken;
    const meetingData = data.meetingData || {};

    // Try to refresh token before upload
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      accessToken = freshToken;
    }

    if (!accessToken) {
      await setState('error', { uploadError: 'Sessão expirada. Faça login novamente.' });
      chrome.runtime.sendMessage({ action: 'uploadError', error: 'Sessão expirada. Faça login novamente.' });
      return;
    }

    console.log('Starting upload, blob size:', blob.size, 'type:', blob.type);

    const isVideo = blob.type.includes('video');
    const ext = isVideo ? 'webm' : 'webm';
    const formData = new FormData();
    formData.append('file', blob, `recording-${Date.now()}.${ext}`);
    formData.append('title', meetingData.title || 'Gravação via Extensão');
    formData.append('meeting_type', meetingData.meetingType || 'empresa');
    formData.append('lead_name', meetingData.leadName || '');
    formData.append('lead_company', meetingData.leadCompany || '');
    formData.append('lead_email', meetingData.leadEmail || '');

    console.log('Sending to upload-recording endpoint...');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    console.log('Upload response status:', res.status);
    const result = await res.json();
    console.log('Upload response:', JSON.stringify(result));

    if (!res.ok) {
      throw new Error(result.error || `Erro no upload (status ${res.status})`);
    }

    await setState('done', { lastMeetingId: result.meetingId });
    await chrome.storage.local.remove(['meetingData']);

    chrome.runtime.sendMessage({
      action: 'uploadComplete',
      meetingId: result.meetingId,
    });
  } catch (err) {
    console.error('Upload error:', err);
    await setState('error', { uploadError: err.message });
    chrome.runtime.sendMessage({ action: 'uploadError', error: err.message });
  }
}
