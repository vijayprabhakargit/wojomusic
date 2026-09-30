# Problem Summary

**Symptom (new observation):**
Player 1 (admin) loads a YouTube song, it starts playing. Player 2 (listener) hears the song slightly ahead — Player 1 is "a couple of seconds behind" Player 2.

**Previously reported symptom (timer display):**
The elapsed timer below the progress bar (in WalkmanPlayer) is "not proper" and "not loading" — i.e., the time display is incorrect/stuck regardless of playback.

---

## Observations from Code

**A. `ytStartAt` captured once, not live**
- `ytStartAtRef` is set at render time when `ytVideoId` changes.
- Listener's value includes network latency → starts ahead of admin.
- After that initial capture, no further correction to start time.

**B. Admin reports progress but server does NOT echo it**
- `player:progress` handler stores position + updates `lastUpdated`.
- It does NOT emit `player:state` back (no broadcast).
- So listeners never learn the admin's actual position during playback.

**C. Listeners extrapolate from stale `lastUpdated`**
- "Live position" = `position + (now - lastUpdated)`.
- Only updated when a `player:state` is broadcast (play/pause/seek/song-change).
- During minutes of playback, extrapolation drifts from reality.

**D. Drift correction has a 2s tolerance**
- Sync effect: `if (Math.abs(t - expected) > 2) seek(expected)`.
- 5s sync interval: drift > 2s triggers correction.
- A gap of 0.5–2s is silently accepted.

**E. Admin's YT player may have extra init latency**
- Admin's browser initiates the YT iframe load (network fetch, buffer).
- Listener's browser does the same independently.
- Both start from their respective `startAt` values.
- Admin at 0s, listener at ~0.5–1s → listener ahead.

## Root Cause

**The `ytStartAt` asymmetry when a YouTube song starts.**

1. Server broadcasts `player:state = { position: 0, lastUpdated: T, isPlaying: true }`.
2. **Admin's render** happens almost instantly → `ytStartAt ≈ 0s`.
3. **Listener's render** happens after network delay (~100–500ms) → `ytStartAt ≈ 0.2–1.0s`.
4. Both YT players load independently and play at the same speed.
5. Listener's audio is already ahead by that initial gap.
6. Admin's 1s progress reports go to server but are **never echoed** to listeners.
7. Listener's 5s sync check only corrects if drift > 2s.
8. **Result:** The initial sub-second gap persists uncorrected and can grow slightly over time (since listeners extrapolate from stale `lastUpdated`).

