

# Video Player for Google Drive Links in Meeting Detail

## Problem
Users paste Google Drive links for meeting recordings but can only click the link to open it externally. They want to watch/listen inline while reviewing the analysis side by side.

## Approach
Google Drive files can be embedded using an iframe with the preview URL format:
`https://drive.google.com/file/d/{FILE_ID}/preview`

The `extractGoogleDriveFileId` helper already exists in the edge function. We need a similar utility on the frontend.

## Plan

### 1. Add embedded video/audio player to MeetingDetail page
- Create a helper function `getGoogleDriveEmbedUrl(url)` that extracts the file ID from Google Drive URLs and returns the `/preview` embed URL
- Replace the current simple link card (lines 125-134) with a card that contains:
  - An iframe embed of the Google Drive file (using `/preview` URL) when a valid Drive link is detected
  - The iframe allows `autoplay`, `encrypted-media` permissions
  - A fallback link for non-Drive URLs (keeps current behavior)
- The embed card will be styled with 16:9 aspect ratio using the existing `AspectRatio` component
- Add a toggle button to collapse/expand the player so it doesn't take too much space when not needed

### 2. Technical details
- **File**: `src/pages/MeetingDetail.tsx`
- Drive URL patterns to support:
  - `drive.google.com/file/d/{ID}/...`
  - `drive.google.com/open?id={ID}`
- Embed URL: `https://drive.google.com/file/d/{ID}/preview`
- The iframe `allow` attribute will include `autoplay; encrypted-media`
- `sandbox` attribute with appropriate permissions for security
- Important: The Drive file must be shared ("Anyone with the link") for the embed to work -- this is already a requirement per the existing integration

### 3. UI layout
- The player card appears where the current link card is, above the analysis
- Collapsible by default (open) so users can minimize when not needed
- Shows original link below the player for reference

