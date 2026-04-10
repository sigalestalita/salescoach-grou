// Sales Coach AI - Offscreen Recording Document

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncGZ1dW5tbWprZ3dqZWZvZmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQwOTIsImV4cCI6MjA5MTA2MDA5Mn0.GhNqsTHRY59h4D13rYeLbwgaq6-x0nqJzfv9dXWcUAQ';
const SUPABASE_URL = 'https://xgpfuunmmjkgwjefofcd.supabase.co';

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;
let micStream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'startRecording') {
    startRecording(msg.streamId);
  }

  if (msg.action === 'stopRecording') {
    stopRecording();
  }
});

async function setState(state, extras = {}) {
  await chrome.storage.local.set({ recordingState: state, ...extras });
}

async function startRecording(streamId) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
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

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      console.log('Microphone not available, recording system audio only');
    }

    let combinedStream;
    if (micStream) {
      const audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();

      const systemAudioTracks = mediaStream.getAudioTracks();
      if (systemAudioTracks.length > 0) {
        const systemSource = audioContext.createMediaStreamSource(
          new MediaStream(systemAudioTracks)
        );
        systemSource.connect(dest);
      }

      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(dest);

      combinedStream = new MediaStream([
        ...mediaStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } else {
      combinedStream = mediaStream;
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(combinedStream, {
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

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      await uploadFromOffscreen(blob);

      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
      }
      recordedChunks = [];
    };

    mediaRecorder.start(1000);
    await setState('recording');
    console.log('Recording started');
  } catch (err) {
    console.error('Failed to start recording:', err);
    await setState('error', { uploadError: err.message });
    chrome.runtime.sendMessage({
      action: 'recordingError',
      error: err.message,
    });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log('Recording stopped');
  }
}

async function uploadFromOffscreen(blob) {
  await setState('uploading');

  try {
    const data = await chrome.storage.local.get(['accessToken', 'meetingData']);
    const accessToken = data.accessToken;
    const meetingData = data.meetingData || {};

    if (!accessToken) {
      await setState('error', { uploadError: 'Sessão expirada. Faça login novamente.' });
      chrome.runtime.sendMessage({ action: 'uploadError', error: 'Sessão expirada. Faça login novamente.' });
      return;
    }

    const formData = new FormData();
    formData.append('file', blob, `recording-${Date.now()}.webm`);
    formData.append('title', meetingData.title || 'Gravação via Extensão');
    formData.append('meeting_type', meetingData.meetingType || 'empresa');
    formData.append('lead_name', meetingData.leadName || '');
    formData.append('lead_company', meetingData.leadCompany || '');
    formData.append('lead_email', meetingData.leadEmail || '');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Erro no upload');
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
