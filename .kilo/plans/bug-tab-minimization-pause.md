# Bug: Playback pauses when tab is minimized / backgrounded

## Description

When joining a multiplayer room, both players must have their browser tab **visible and in the foreground** for the song to play uninterrupted. If one player minimizes their browser tab (especially on mobile — tested), the YouTube iframe auto-pauses, and the song stops playing for both participants until that user returns.

## Root Cause

The YouTube IFrame Player API **auto-pauses playback by default** when the browser tab loses visibility (`document.hidden === true`). The codebase has zero handling for:

- `document.visibilitychange` event
- `window.blur` / `window.focus`
- YouTube IFrame config `pausesVideoInBackground`

## Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `client/src/components/YtIframePlayer.jsx` | 42-81 | YouTube player created without `pausesVideoInBackground: false` — allows default auto-pause on tab hide |
| `client/src/pages/Room.jsx` | _(anywhere)_ | No `visibilitychange` listener to resume playback when tab returns to foreground |
| `client/src/pages/Room.jsx` | 191-250 | Progress/sync intervals keep running while tab is hidden, so when user returns the position jump-seeks forward — jarring experience |
| `client/src/components/YtIframePlayer.jsx` | _(anywhere)_ | No `player.addEventListener('onStateChange', ...)` to detect browser-initiated pause on visibility change |

## Steps to Reproduce

1. Open a room from two browser tabs/clients (e.g., desktop + mobile)
2. Start playing a song
3. Minimize the mobile browser or switch to another app
4. Observe: the song stops playing
5. Return to the tab — playback may resume with incorrect position (jump-seek forward), or remain paused

## Expected Behavior

- Tab minimization should **not** interrupt playback
- When the tab becomes visible again, the player should detect it was paused by the browser and resume at the correct synced position
- The `position` reported/used should account for the time spent backgrounded

## Suggested Fix (future)

1. **Set `pausesVideoInBackground: false`** in `YtIframePlayer.jsx` player creation options (prevents YouTube from pausing on tab hide)
2. **Add `document.addEventListener('visibilitychange', ...)`** in `Room.jsx` that:
   - On `document.hidden === false` (tab became visible): check if local player is paused while server state says `isPlaying: true`
   - If drift > threshold, seek to `livePosition()` and call `play()`
3. **Detect browser-initiated pause** in the YouTube `onStateChange` callback — if state is `-1` (unstarted) or `2` (paused) and the server says it should be playing, auto-resume after a small delay

## Environment

- Browser: Chrome / Safari (mobile)
- OS: iOS / Android
- App version: current `main` branch