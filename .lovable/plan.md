

## Complete Extension Refactor — Fix Recording Failures

### Root Cause (confirmed via Chrome documentation and bug reports)

Two **known Chrome MV3 limitations** make the current architecture impossible to work:

1. **`desktopCapture.chooseDesktopMedia` streamId cannot be used in offscreen documents.** The streamId from `desktopCapture` is bound to the context that called the API (the service worker), and cannot be consumed by `getUserMedia` in a different context (the offscreen document). This causes "DOMException: Invalid state".

2. **`getUserMedia({ audio })` for microphone always fails in offscreen documents.** The microphone permission is stuck in "prompt" state in offscreen context, and since there's no user gesture, it's auto-dismissed with "Permission dismissed". This is a confirmed Chrome bug with no fix.

### Solution: Replace offscreen with a recorder window

Instead of an offscreen document, open a **small Chrome window** (`recorder.html`) that acts as the recording page. This is the approach recommended by Chrome's official docs for pre-Chrome-116 and is the most reliable across all Chromium browsers:

- A real extension page has full access to `getUserMedia` (mic) and `getDisplayMedia` (screen + system audio)
- It stays open during the meeting (unlike the popup)
- It has a real user gesture context, so all permissions work

### Architecture

```text
popup.html                recorder.html (new window)
┌─────────────┐           ┌──────────────────────┐
│ Login        │           │ Timer display         │
│ Meeting form │──opens──▶ │ getDisplayMedia()     │
│ Start button │           │ getUserMedia(mic)     │
└─────────────┘           │ MediaRecorder         │
                          │ Upload on stop        │
      background.js       └──────────────────────┘
      (message relay,            │
       badge updates)            │
                                 ▼
                          upload-recording edge fn
```

### File Changes

**DELETE**: `extension/offscreen.html`, `extension/offscreen.js` — no longer needed

**NEW**: `extension/recorder.html` + `extension/recorder.js`
- Small window (400x200) with timer, status, and stop button
- On load: calls `getDisplayMedia({ video: true, audio: true })` for screen + system audio
- Then calls `getUserMedia({ audio: true })` for microphone
- Mixes both audio streams via AudioContext
- Records via MediaRecorder
- On stop: uploads to the edge function
- Includes all the upload logic (token refresh, error handling)

**EDIT**: `extension/manifest.json`
- Remove `offscreen` permission (no longer needed)
- Remove `desktopCapture` permission (using web API instead)
- Keep `tabCapture`, `storage`, `tabs`

**EDIT**: `extension/background.js`
- Remove all offscreen document logic
- On `startRecording` message: open `recorder.html` as a small window via `chrome.windows.create`
- On `stopCapture` message: send stop message to recorder window
- Keep badge management and storage proxy

**EDIT**: `extension/popup.js`
- Remove `ensureMicrophoneAccess()` (no longer needed — recorder window handles it)
- Start button sends message to background which opens the recorder window
- Remove screen share logic

**REPACKAGE**: `public/sales-coach-extension.zip`

### Why This Works
- `getDisplayMedia` works in any extension page with a user gesture (the page opening IS the gesture context)
- `getUserMedia` for microphone works in real extension pages (not offscreen)
- The recorder window stays open during recording (unlike popup which closes on blur)
- Works across Chrome, Arc, Edge, Brave, and all Chromium browsers

