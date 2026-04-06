

## Fix: AssemblyAI API parameter error

### Problem
The edge function is failing with:
```
"speech_models" must be a non-empty list containing one or more of: "universal-3-pro", "universal-2"
```

AssemblyAI updated their API — it now requires a `speech_model` (or `speech_models`) parameter. The current code only sends `language_code: "pt"`, which is incompatible.

### Fix

**File:** `supabase/functions/analyze-meeting/index.ts`

Update the `transcribeWithAssemblyAI` function's request body:

- Remove `language_code: "pt"` (automatic detection works well for Portuguese)
- Add `speech_model: "universal-2"` (stable, supports Portuguese + speaker diarization)
- Keep `speaker_labels: true`

```typescript
body: JSON.stringify({
  audio_url: audioUrl,
  speech_model: "universal-2",
  speaker_labels: true,
  language_detection: true,
})
```

### After deploy
The stuck meeting will need to be re-analyzed using the "Refazer análise" button since the current invocation already failed.

