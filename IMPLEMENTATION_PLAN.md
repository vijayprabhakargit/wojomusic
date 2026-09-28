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

---

## Goal 6 — Mobile layout fixes + desktop UX polish

**Problem 1 (Mobile scrolling):** On mobile the root uses `height: auto` and
`overflow: visible`, so the page grows vertically instead of being a fixed
viewport height with internal scrolling in the panels. Desktop was fixed in
Goal 1 but mobile was left out.

**Problem 2 (Verify mobile/desktop):** Need to confirm every feature works
seamlessly on both mobile and desktop viewports.

**Problem 3 (Panel buttons on desktop):** The Queue/Chat/People tab buttons are
shown on desktop even though all panels are always visible there — they serve no
purpose and confuse users. On mobile they're essential for panel switching.

### Steps

- [x] **6.1** Fix mobile root container — use `height: 100dvh` and
  `overflow: hidden` (same as desktop) so the page doesn't grow vertically.
- [x] **6.2** Give the right column `flex: 1` on mobile so the active panel
  fills remaining viewport height instead of using hardcoded `minHeight`.
- [x] **6.3** Hide the Queue/Chat/People tab buttons on desktop (wrap in
  `{isMobile && (...)}`).
- [x] **6.4** Verify all features work on both mobile and desktop:
    - Create/join room (Landing page responsive styles)
    - Play/Pause/Next/Prev controls
    - Progress bar & seek
    - Upload files and show progress
    - Queue: add, remove, drag-reorder, click-to-play
    - Chat: send messages, auto-scroll, system messages
    - Participants list
    - Source selector modal (overlay on both viewports)
- [x] **6.5** Build and verify.

---

## Goal 7 — YouTube link support (paste a link → add to queue)

**Problem:** Users can only add music from local file uploads or Google Drive.
There's no way to paste a YouTube link and have the audio automatically added
to the queue.

**Solution:** Add a third "YouTube" tab in the SourceSelector modal. When a
YouTube URL is pasted, the server fetches video info (title, duration) using
`ytdl-core` and adds it to the queue with `source: 'youtube'`. When the song
reaches the top of the queue, the server downloads just the audio stream via
`ytdl-core`, caches it as an MP3 on disk, and streams it to all clients
(following the same deferred-download pattern as Google Drive).

### Steps

- [x] **7.1** Add `downloadFromYoutube(url, roomId, songId)` method to
  `server/fileHandler.js` — uses `ytdl-core` to download audio-only stream,
  saves to disk, returns `{ filePath, publicUrl }`.
- [x] **7.2** Add `getYoutubeInfo(url)` method to `server/fileHandler.js` —
  uses `ytdl.getInfo(url)` to extract video title and duration.
- [x] **7.3** Add `youtube:add` socket event in `server/index.js` — receives
  YouTube URL, fetches video info, adds to queue with `source: 'youtube'`.
- [x] **7.4** Handle `source: 'youtube'` in `playSong()` in `server/index.js` —
  calls `downloadFromYoutube` when the song is about to play (same pattern as GDrive).
- [x] **7.5** Handle `source: 'youtube'` in `preFetchSong()` in `server/index.js` —
  pre-fetches the next YouTube song if it's coming next.
- [x] **7.6** Add YouTube tab to `client/src/components/SourceSelector.jsx` —
  text input for YouTube URL, "Add to Queue" button.
- [x] **7.7** Build and verify.

---

## Goal 8 — Fix "Sign in to confirm you're not a bot" in production (Render)

**Problem:** Streaming works locally but fails (`playabilityStatus.status = LOGIN_REQUIRED`, reason
"Sign in to confirm you're not a bot").

**Root causes (verified against youtubei.js v18.1.0 + bgutils-js v4.0.3 sources
and the yt-dlp PO Token Guide):**

1. **No session-bound PoToken.** We mint a content-bound (video ID) token per
   request via `getBasicInfo(id, { po_token })`, but never pass a token to
   `Innertube.create({ po_token })`. Per the library docs: "If not provided,
   session bound token will be used" — we never provide one, so on flagged
   datacenter IPs (Render egress) the session itself is untrusted →
   LOGIN_REQUIRED. Critically, `Innertube.create({ po_token })` is also what
   sets `Player.po_token`, which is stamped as the `pot=` query parameter on
   every deciphered googlevideo URL — and GVS requires a PoToken for web /
   web_music / android / ios clients. Without it, CDN URLs 403 or throttle.
2. **Visitor-data identity inconsistency.** We re-scrape a fresh visitor token
   from the homepage every 30 min and discard it on restart, while the BotGuard
   minter's attestation ran under a different identity. The WebPO token must be
   minted from the SAME visitor data the session uses, and that
   (visitorData, token) pair must be persisted and reused — the "stateful
   session" pattern from tombulled/innertube and Metrolist.
3. **No rotation/recovery.** When a (visitorData, token) pair gets flagged we
   retry it forever. References rotate identity on LOGIN_REQUIRED.
4. **Stale CDN URL cache across identity changes.** googlevideo URLs are
   session/IP-bound; after an identity rotation the old cache is poison, and a
   403 mid-stream is never retried with a fresh URL.

### Steps

- [x] **8.1** Rework `server/poToken.js` into a robust PoToken provider: one
  shared BotGuard minter with TTL refresh, automatic rebuild on mint failure,
  and `mint(contentBinding)` usable for both session-bound (visitor data) and
  content-bound (video ID) tokens.
- [x] **8.2** Implement the two-token architecture in `server/youtube.mjs`:
  create session → read the *actual* `session.context.client.visitorData` →
  mint a session-bound token from that exact value → recreate Innertube with
  `{ visitor_data, po_token }` (this sets `Player.po_token` → `pot=` on all
  deciphered URLs) → keep per-request content-bound tokens for WEB clients.
- [x] **8.3** Persist the session identity `{ visitorData, sessionToken }` to
  disk (env-configurable path, `YT_SESSION_FILE`) and reload it on boot, so
  restarts on Render reuse the same trusted identity instead of starting cold
  on every deploy.
- [x] **8.4** Add identity rotation: on the bot check (LOGIN_REQUIRED), mark
  the current identity flagged, mint a brand-new visitorData + session-token
  pair, recreate the session, clear caches, and retry once. Guard with a
  cooldown to prevent rotation storms.
- [x] **8.5** Cache hygiene in `server/fileHandler.js`: clear the stream URL
  cache on identity rotation; if the CDN returns 403 mid-proxy, invalidate the
  cached URL for that video and refetch once with a fresh URL.
- [x] **8.6** Add a `/api/yt-debug` endpoint in `server/index.js` and upgrade
  `diagnose()` to report egress IP, identity age, session-token presence and a
  per-client status matrix for production diagnosis.
- [x] **8.7** Update `YOUTUBE_INNERTUBE_RESEARCH.md` documenting the two-token
  architecture (session-bound vs content-bound) and rotation policy.
- [x] **8.8** Run local test scripts and verify end-to-end (getInfo →
  getStreamUrl → proxy → 206 partial content).

### Post-plan fixes (found while verifying)

- [x] **9.1** Invalid client key: `CLIENT_ORDER` used `WEB_REMIX`, which is not
  a valid key in youtubei.js 18.x (`Constants.SUPPORTED_CLIENTS` has
  `YTMUSIC`; the InnerTube protocol name `WEB_REMIX` throws
  `Invalid client: WEB_REMIX`). Replaced with `YTMUSIC`, dropped `TV`
  (TVHTML5 returns `UNPLAYABLE :: The page needs to be reloaded`), and
  reordered to `ANDROID_VR, IOS, WEB, YTMUSIC` so the WEB clients (most
  likely to get bot-checked on datacenter IPs) come after the reliable
  native clients. Updated `WEB_CLIENTS`, the `diagnose()` client matrix,
  `server/tests/test_diag.mjs` and `server/tests/youtube.test.mjs`.
  Verified locally: full chain getInfo -> getStreamUrl -> CDN 206; matrix
  15/15 pass; proxy tests 2/2 pass against a running server.
