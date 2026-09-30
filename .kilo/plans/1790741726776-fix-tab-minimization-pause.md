# Fix: Playback pauses when tab is minimized / backgrounded

## Problem

YouTube IFrame player auto-pauses on tab hide (default behavior). The codebase has zero handling for `document.visibilitychange`, `window.blur/focus`, or the YouTube playerVars `pausesVideoInBackground`.

## Changes

### 1. `client/src/components/YtIframePlayer.jsx` — Prevent YouTube auto-pause

**Add `pausesVideoInBackground: 0` to `playerVars`** (line ~45). This tells the YouTube IFrame not to pause when the browser tab becomes hidden.

**Also add an `onVisibilityChange` callback** in the YouTube `events` config (line ~56) so the parent can wire into it for recovery.

**Also let the imperative API expose `getPlayerState()` consistently** (already done, line 115, fine as-is).

### 2. `client/src/pages/Room.jsx` — Visibility recovery handler

**Add a `visibilitychange` listener** (new `useEffect` block, placed after the existing event listeners around line 60) that:

1. When `document.visibilityState === 'visible'`:
   - Read `playerState.isPlaying` from the server state
   - If the server says `isPlaying: true`:
     - For YT mode: check `ytRef.current?.getPlayerState?.()` — if it's `2` (paused) or `-1` (unstarted), call `ytRef.current.seek(livePosition(playerState))` then `ytRef.current.play()`
     - For `<audio>` mode: check `audioRef.current?.paused` — if true, seek to `livePosition(playerState)` and call `audioRef.current.play()`

2. Clean up the listener on unmount.

### 3. (Optional/minor) `client/src/pages/Room.jsx` — Pause progress interval while hidden

Skip reporting progress when `document.hidden` to avoid broadcasting stale positions. Add a `document.hidden` guard in the progress interval callback (line ~200) — if hidden, skip the `socket.reportProgress()` call.

## Edge cases covered

- **All clients hidden**: When any client returns to foreground, the visibility handler detects the paused state and resumes + seeks to `livePosition()`.
- **Mobile Safari / Android Chrome**: Both benefit from the same resume-on-return logic.
- **Non-controller (listener)**: Visibility handler still fires and resumes local playback; the next 5s sync check will correct any remaining drift.
- **Intentional pause by controller**: If the server `isPlaying` is `false`, the visibility handler does nothing — correct.

## Files to touch

- `client/src/components/YtIframePlayer.jsx` — 1 addition to playerVars
- `client/src/pages/Room.jsx` — 1 new useEffect + 1 guard in progress interval