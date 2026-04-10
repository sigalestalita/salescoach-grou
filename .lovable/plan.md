

## Fix: Extension recording fails with DOMException

### Root Cause

Two issues identified from the screenshots:

1. **`audioCapture` is invalid for extensions** -- it's only for Chrome Apps. This causes a warning and doesn't grant mic permissions.

2. **Offscreen document created with only `USER_MEDIA` reason** -- but `startFullRecording` uses `chromeMediaSource: 'desktop'` constraints which require `DISPLAY_MEDIA` reason. Without it, the `getUserMedia` call throws a DOMException.

### Changes

**`extension/manifest.json`**
- Remove `audioCapture` from permissions (invalid for extensions)

**`extension/background.js`**
- Change offscreen creation reasons from `['USER_MEDIA']` to `['USER_MEDIA', 'DISPLAY_MEDIA']`

**`extension/offscreen.js`**
- In `startFullRecording`, add fallback: if screen capture with `chromeMediaSource: 'desktop'` fails (DOMException), fall back to mic-only recording so the meeting is still captured
- Improve error message to distinguish between screen capture failure and mic failure

**Re-package** `public/sales-coach-extension.zip`

### Result
Screen + mic recording will work when the browser supports desktop capture from offscreen documents. If it fails (e.g., Arc browser restrictions), the extension gracefully falls back to mic-only recording instead of showing an error.

