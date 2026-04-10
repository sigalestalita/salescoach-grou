

## Problem

The extension successfully uploads the `.webm` recording and creates the meeting, but the **analysis fails** because Groq's Whisper API rejects the file with `"could not process file - is it a valid media file?"`.

The root cause: the extension records **video+audio as webm** (with VP8+Opus codecs). Groq's Whisper API expects pure audio files and cannot process video containers.

## Solution

Use **AssemblyAI** (which already works for Google Drive URLs) for storage-uploaded files too. Instead of downloading the file and sending it to Groq, generate a **signed URL** from Supabase Storage and pass it directly to AssemblyAI's API — it handles webm, video containers, and all common formats natively.

## Changes

### 1. `supabase/functions/analyze-meeting/index.ts`

Modify the `file_url` branch (~lines 166-177) to:
- Generate a signed URL for the storage file (using `supabase.storage.from("meeting-files").createSignedUrl(...)`)
- Pass the signed URL to `transcribeWithAssemblyAI()` instead of downloading and sending to Groq
- Keep the Groq/OpenAI path as a fallback only if AssemblyAI key is not available

The flow becomes:
```
file_url → create signed URL → AssemblyAI (with speaker diarization) → transcript
```

This is simpler, more reliable, and gives speaker diarization for extension recordings too.

### 2. Re-trigger the stuck meeting

Reset the "Reunião com a Apple" meeting status and re-trigger analysis so it processes with the new code.

### 3. Repackage extension ZIP

No extension changes needed — the fix is entirely server-side.

