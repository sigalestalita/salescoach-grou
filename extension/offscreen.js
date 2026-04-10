// Sales Coach AI - Offscreen Recording Document

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;
let micStream = null;

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'startRecording') {
    await startRecording(msg.streamId);
  }

  if (msg.action === 'stopRecording') {
    stopRecording();
  }
});

async function startRecording(streamId) {
  try {
    // Get screen/tab stream using the streamId from desktopCapture
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

    // Try to get microphone audio too
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      console.log('Microphone not available, recording system audio only');
    }

    // Combine streams
    let combinedStream;
    if (micStream) {
      const audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();

      // System audio
      const systemAudioTracks = mediaStream.getAudioTracks();
      if (systemAudioTracks.length > 0) {
        const systemSource = audioContext.createMediaStreamSource(
          new MediaStream(systemAudioTracks)
        );
        systemSource.connect(dest);
      }

      // Mic audio
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(dest);

      // Video tracks from screen + mixed audio
      combinedStream = new MediaStream([
        ...mediaStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } else {
      combinedStream = mediaStream;
    }

    // Start recording
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 1000000, // 1 Mbps for reasonable file size
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const blobUrl = URL.createObjectURL(blob);

      // Send blob URL back to background/popup
      chrome.runtime.sendMessage({
        action: 'recordingComplete',
        blobUrl,
      });

      // Cleanup
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

    mediaRecorder.start(1000); // Collect data every second
    console.log('Recording started');
  } catch (err) {
    console.error('Failed to start recording:', err);
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
