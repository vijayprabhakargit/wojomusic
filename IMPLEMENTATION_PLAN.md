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

## Notes / Decisions

- Internal CSS class names (`walkman-btn`, `walkman-input`, `--cassette-*`) are
  kept as-is to avoid a large, risky rename across every component. Only
  user-visible branding changes. (Can be renamed later if desired.)
- npm package names cannot contain spaces, so `wojo-music` is used there while the
  displayed brand is "Wojo Music".
