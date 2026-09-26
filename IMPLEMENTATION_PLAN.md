# Implementation Plan — Wojo Music

This document breaks the requested work into discrete steps. Each step is checked
off as it is completed.

---

## Goal 1 — Fix the scrolling bug (Chat + Queue)

**Problem:** As chat messages accumulate (and as the queue grows), the panel and
the overall page keep growing vertically instead of staying a fixed size. The user
should be able to scroll *inside* the chat/queue while the surrounding layout stays
a constant height.

**Root cause:** In `client/src/pages/Room.jsx` the root container uses
`minHeight: '100vh'` with no fixed height. Because the parent height is not bounded,
the flex children (`flex: 1`) grow to fit their content instead of scrolling. The
chat list also has no height cap (the queue is capped at `350px`, which is why it
behaves differently). Additionally `scrollIntoView` is used for auto-scroll, which
scrolls the whole page.

### Steps

- [x] **1.1** Add a reactive `isMobile` viewport hook in `Room.jsx` (replace inline
  `window.innerWidth < 768` reads so resizing works correctly).
- [x] **1.2** Make the Room root a fixed-height flex column (`height: 100vh`,
  `overflow: hidden`) on desktop so children can scroll internally.
- [x] **1.3** Constrain the main content row and the right-hand column with
  `minHeight: 0` so flex children are allowed to shrink and scroll.
- [x] **1.4** Give the Queue and Chat panel containers bounded heights
  (`minHeight: 0` on desktop; a capped height on mobile) and keep `overflow: hidden`.
- [x] **1.5** Remove the hard `maxHeight: '350px'` in `QueuePanel.jsx` and let the
  list fill its container with `flex: 1; overflow-y: auto; min-height: 0`.
- [x] **1.6** Fix `Chat.jsx` auto-scroll to scroll the message container directly
  (`scrollTop = scrollHeight`) instead of `scrollIntoView`, so only the chat scrolls.

---

## Goal 2 — Rebrand to "Wojo Music"

Rename user-facing branding from "Walkman Room" / "music-room" to **Wojo Music**.
Replace the logo with a minimalist cat wearing headphones.

### Steps

- [x] **2.1** Create a new minimalist cat-with-headphones SVG logo
  (`client/public/favicon.svg`) and reuse it in the UI (Landing + Room headers).
- [x] **2.2** Update `client/index.html` `<title>` and favicon reference.
- [x] **2.3** Update `client/src/pages/Landing.jsx` heading, tagline, and footer.
- [x] **2.4** Update `client/src/pages/Room.jsx` top-bar brand name.
- [x] **2.5** Update `client/src/index.css` theme comment.
- [x] **2.6** Update `server/index.js` startup log message.
- [x] **2.7** Update package names: root `package.json`, `server/package.json`,
  `client/package.json` (and lockfiles where trivial).
- [x] **2.8** Update `render.yaml` (service name, comment, `CLIENT_URL`).
- [x] **2.9** Update `README.md` and `DESIGN.md` branding.

---

## Goal 3 — Verify

- [x] **3.1** Build the client (`npm run build` in `client/`) to confirm no syntax
  errors after the edits.

---

## Goal 4 — LRU Queue (max 20 songs)

**Problem:** The queue can grow unbounded, consuming memory and making the UI
hard to navigate.

**Solution:** Cap the queue at 20 songs using LRU (Least Recently Used) eviction.
When a song is played, it's marked as recently used. When a new song is added and
the queue is full, the least recently used song (preferring never-played songs,
then oldest played) is automatically evicted. The currently playing song is never
evicted.

### Steps

- [x] **4.1** Add `MAX_QUEUE_SIZE = 20` constant and `lastPlayedAt` field to
  queue items in `server/rooms.js`.
- [x] **4.2** Add `markSongPlayed(roomId, songId)` method to `rooms.js` — sets
  `lastPlayedAt` to `Date.now()` when a song starts playing.
- [x] **4.3** Add `evictLRU(roomId)` method to `rooms.js` — when queue exceeds
  max size, finds the least recently used song (excluding current), removes it,
  and returns it.
- [x] **4.4** Wire up `playSong()` in `server/index.js` to call
  `markSongPlayed()` when a song starts, so played songs are preserved.
- [x] **4.5** Wire up `queue:add` handler in `server/index.js` to call
  `evictLRU()` after adding, and emit a system chat message when eviction happens.
- [x] **4.6** Update `QueuePanel.jsx` to show queue count as `X/20`.
- [x] **4.7** Build and verify.

---

## Goal 5 — Queue UX fixes (upload progress, click-to-play, reorder & delete bugs)

**Problem:** Four user-facing issues degrade the queue experience:
1. Uploading multiple files shows no progress (just "Uploading...").
2. No way to click a queue item to play it directly.
3. Drag-to-reorder silently breaks after first use (server `callback` is `undefined`).
4. Remove song silently breaks after first use (same root cause as #3).

**Root cause of #3 & #4:** Client emits `queue:remove` / `queue:reorder` without
a callback argument. The server tries to call `callback()` → throws TypeError →
catch block throws again → Socket.IO handler degrades → subsequent operations fail.

### Steps

- [x] **5.1** Show upload progress (`2/5`, `3/5`, etc.) in `SourceSelector.jsx`
  while uploading multiple files.
- [x] **5.2** Add `player:playSpecific` event on server to play a specific queue index.
- [x] **5.3** Add `playFromQueue(index)` to `useSocket.js`.
- [x] **5.4** Pass `onPlayFromQueue` from `Room.jsx` to `QueuePanel.jsx`.
- [x] **5.5** Add click handler on queue items in `QueuePanel.jsx` to play via click.
- [x] **5.6** Fix `queue:remove` and `queue:reorder` in `server/index.js` —
  guard `callback()` with `if (callback)` so undefined callbacks don't throw.
- [x] **5.7** Add promise callbacks to `removeFromQueue` / `reorderQueue` in
  `useSocket.js` for reliable server acknowledgement.
- [x] **5.8** Build and verify.

---

## Notes / Decisions

- Internal CSS class names (`walkman-btn`, `walkman-input`, `--cassette-*`) are
  kept as-is to avoid a large, risky rename across every component. Only
  user-visible branding changes. (Can be renamed later if desired.)
- npm package names cannot contain spaces, so `wojo-music` is used there while the
  displayed brand is "Wojo Music".
