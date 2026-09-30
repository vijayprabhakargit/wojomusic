# Upcoming work

## 1. YouTube catalog search UI

Add a search tab to the SourceSelector modal that lets users search the YouTube Music catalog directly, pick a result, and add it to the queue.

**Server**: `/api/music-search?q=...` already exists (server/index.js:120-133) — returns results via `youtube.mjs:searchMusic()`.

**Client**:
- Add a "search" tab to SourceSelector (alongside local/gdrive/youtube)
- Text input + debounced search (300ms) hitting `/api/music-search`
- Results rendered as a scrollable list with: thumbnail, title, artist, duration
- Tapping a result adds it to queue via `socket.addYoutube(result.videoId)` or a new socket event
- Works on desktop (full modal) and mobile (responsive layout)
- Loading/error/empty states

**Files to touch**:
- `client/src/components/SourceSelector.jsx` — new tab + search + results list
- Possibly a new hook or component for the search results if SourceSelector gets too big

## 2. Android client app

A native Android app (Kotlin) that connects to the existing Wojo Music server as a socket.io client.

**Architecture**:
- Kotlin + Jetpack Compose (UI) + ExoPlayer (audio) + socket.io-client (sync)
- Connects to the same server via the same socket.io protocol
- Resolves YouTube audio URLs via InnerTube calls from the device (residential IP → no bot check)
- Plays audio via ExoPlayer → native background playback, lock screen controls

**Sync protocol** (identical to web client):
- `player:play`, `player:pause`, `player:seek` — transport events
- `player:progress` — report ExoPlayer position every 1s
- `player:sync` — drift correction every 5s
- `player:state` — receive server broadcasts

**Features to match**:
- Room join/leave (share room ID, invite link)
- Playback controls (play/pause/seek/next/prev)
- Queue management (view, reorder, remove)
- Chat (read, send messages)
- YouTube search + add to queue
- Local file upload
- Participants list
- Background playback with lock screen media controls