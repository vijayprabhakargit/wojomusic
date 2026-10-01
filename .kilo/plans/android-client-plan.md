# Wojo Music — Android Client Plan

## 1. Overview

A native Android client that connects to the existing Wojo Music socket.io server. It mirrors the web client's protocol exactly, but uses ExoPlayer (instead of a YouTube iframe) for audio playback, and resolves YouTube streams via InnerTube calls from the device (residential IP → no bot check, no PoToken needed). Background playback works natively because ExoPlayer runs inside a MediaSessionService.

---

## 2. Protocol Mapping (socket.io events)

The Android client emits/receives the **exact same socket.io events** as the web client (`useSocket.js` / `server/index.js`). No server changes needed.

### Outgoing (Client → Server)

| Event | Payload | When |
|---|---|---|
| `room:create` | `{ name, role }` | Create room |
| `room:join` | `{ roomId, name, role }` | Join room |
| `room:leave` | `{ roomId }` | Leave room |
| `queue:add` | `{ roomId, song }` | Add song to queue |
| `queue:remove` | `{ roomId, songId }` | Remove from queue |
| `queue:reorder` | `{ roomId, fromIndex, toIndex }` | Reorder queue |
| `player:play` | `{ roomId }` | Play |
| `player:pause` | `{ roomId }` | Pause |
| `player:seek` | `{ roomId, position }` | Seek (seconds) |
| `player:next` | `{ roomId }` | Next track |
| `player:previous` | `{ roomId }` | Previous track |
| `player:playSpecific` | `{ roomId, index }` | Play queue item by index |
| `player:progress` | `{ roomId, position }` | Periodic position report (~1s) |
| `player:sync` | `{ roomId, clientPosition, clientTimestamp }` | Drift correction (~5s) |
| `chat:message` | `{ roomId, message }` | Send chat message |
| `youtube:add` | `{ roomId, url }` | Add YouTube video by URL |
| `file:upload` | `{ roomId, fileBuffer (bytes), fileName, fileType }` | Upload local audio file |

### Incoming (Server → Client)

| Event | Payload | Handling |
|---|---|---|
| `connect` / `disconnect` | — | Update connection state |
| `room:joined` | `{ roomId, participant, participants, queue, playerState }` | Initialize room UI + start playback |
| `participants:update` | `Participant[]` | Update participants list |
| `queue:updated` | `Song[]` | Update queue list |
| `player:state` | `{ currentSong, currentIndex, isPlaying, position, lastUpdated }` | Apply playback state to ExoPlayer |
| `player:ended` | — | Clear current song |
| `chat:message` | `{ id, sender, message, timestamp }` | Append to chat |
| `chat:system` | `string` | Append system message |
| `role:promoted` | `{ role }` | Update my role |

---

## 3. YouTube Stream Resolution (InnerTube from device)

The Android client resolves YouTube audio streams **directly from the device** using InnerTube API calls (residential IP → bot checks don't trigger).

**Flow:**

```
User taps play on a YouTube song
  → App has videoId from queue item
  → Make InnerTube POST /player request from device (Ktor)
  → Parse PlayerResponse: extract audio-only streams (itag 140/251)
  → Wrap URL in ExoPlayer MediaItem
  → ExoPlayer plays via MediaSessionService (background allowed)
```

**Key detail**: The server stores `{ source: 'youtube', videoId: '...', url: '...' }` in the queue. The Android client ignores the `url` field for YouTube songs and resolves the audio stream itself via InnerTube. For local/GDrive songs, it uses the server-provided URL directly.

**Why this works**:
- InnerTube calls from a residential IP (phone on cellular/WiFi) do NOT trigger bot checks
- No PoToken, no cookie, no visitor data gymnastics needed on the device
- Echo-Music's InnerTube module (Ktor + models) can be adapted directly

---

## 4. Project Structure

```
wojo-music/                          ← repo root
├── server/                          ← existing Express + socket.io server
├── client/                          ← existing web client (Vite + React)
├── android-client/                  ← NEW: native Android client
│   ├── build.gradle.kts             (root — Kotlin 2.x, Hilt plugin, protobuf)
│   ├── settings.gradle.kts          (modules)
│   ├── gradle/
│   │   ├── libs.versions.toml       (version catalog)
│   │   ├── wrapper/
│   │   │   └── gradle-wrapper.properties
│   │   └── gradle.properties
│   └── app/
│       ├── build.gradle.kts         (app module — Compose, ExoPlayer, socket.io)
│       └── src/main/
│           ├── AndroidManifest.xml
│           └── kotlin/com/wojo/music/
│               ├── WojoApp.kt                    — Application (Hilt)
│               ├── MainActivity.kt               — Single Activity
│               ├── service/
│               │   ├── WojoSocketService.kt      — socket.io client wrapper (ViewModel+Service)
│               │   └── MusicService.kt           — MediaSessionService + ExoPlayer
│               ├── protocol/
│               │   ├── SocketClient.kt           — socket.io connection, event dispatch
│               │   ├── Models.kt                 — data classes (PlayerState, Song, Participant)
│               │   └── SyncManager.kt            — position reporting, drift correction
│               ├── playback/
│               │   ├── ExoPlayerManager.kt       — ExoPlayer setup, MediaSession binding
│               │   └── InnerTubeResolver.kt      — YouTube stream URL resolution (Ktor)
│               ├── ui/
│               │   ├── landing/
│               │   │   └── LandingScreen.kt      — Create/join room
│               │   ├── room/
│               │   │   ├── RoomScreen.kt         — Main room layout
│               │   │   ├── PlayerBar.kt          — Compact player bar (bottom)
│               │   │   ├── FullPlayerSheet.kt    — Full player (bottom sheet)
│               │   │   ├── ChatPanel.kt          — Chat messages + input
│               │   │   └── ParticipantsSheet.kt  — Participants list (bottom sheet)
│               │   ├── queue/
│               │   │   └── QueueSheet.kt         — Queue management (bottom sheet)
│               │   ├── search/
│               │   │   └── SearchSheet.kt        — YouTube search + add to queue
│               │   └── sources/
│               │       └── SourceSelectorSheet.kt — Add song: local upload, YouTube URL, GDrive link
│               └── di/
│                   ├── NetworkModule.kt          — Ktor, OkHttp
│                   └── SocketModule.kt           — socket.io client provider
├── package.json                      ← root monorepo scripts (dev, build, install:all)
└── .kilo/                            ← Kilo AI config / plans
```

---

## 5. Key Libraries (gradle/libs.versions.toml)

| Purpose | Library | Version |
|---|---|---|
| Socket.io | `io.socket:socket.io-client` | 2.1.0 |
| Media playback | `androidx.media3:media3-exoplayer` | 1.7.1 |
| Media session | `androidx.media3:media3-session` | 1.7.1 |
| UI | Jetpack Compose + Material3 | latest stable |
| HTTP (InnerTube) | Ktor client + OkHttp engine | 3.x |
| Serialization | `kotlinx.serialization` + `kotlinx.serialization.json` | 1.7.x |
| DI | Hilt (Dagger) | 2.59.x |
| Async | Kotlin Coroutines + Flow | 1.9.x |
| Lifecycle | `androidx.lifecycle:lifecycle-viewmodel-compose` | 2.10.x |

---

## 6. Key Components — Data Flow

### SocketClient (socket.io wrapper)

```kotlin
class SocketClient @Inject constructor() {
    private val socket = IO.socket(SERVER_URL)  // io.socket:socket.io-client

    val connectionState: StateFlow<ConnectionState>
    val playerState: StateFlow<PlayerState?>
    val queue: StateFlow<List<Song>>
    val participants: StateFlow<List<Participant>>
    val chatMessages: StateFlow<List<ChatMessage>>

    fun connect()
    fun disconnect()
    fun createRoom(name: String, role: String): CompletableDeferred<CreateRoomResult>
    fun joinRoom(roomId: String, name: String, role: String)
    fun emitPlay()
    fun emitPause()
    fun emitSeek(position: Float)
    fun emitProgress(position: Float)
    fun emitSync(position: Float, clientTimestamp: Long)
    fun emitChat(message: String)
    fun emitAddToQueue(song: SongAddPayload)
    fun emitRemoveFromQueue(songId: String)
    // ...
}
```

### SyncManager (position reporting & drift correction)

Runs two coroutines:
1. **Progress reporter** — every 1s, emit `player:progress` with current ExoPlayer position
2. **Drift sync** — every 5s, emit `player:sync` with `{ clientPosition, clientTimestamp }`

Receives `player:state` from server; if the server says isPlaying=true but local ExoPlayer is paused (drift), seek to the live expected position.

### ExoPlayerManager

```kotlin
class ExoPlayerManager @Inject constructor(
    private val context: Context
) {
    private val player = ExoPlayer.Builder(context)
        .setAudioAttributes(AudioAttributes.DEFAULT, true)  // allow background
        .build()

    // Wraps a Song into a MediaItem
    fun playSong(song: Song) {
        val uri = if (song.source == "youtube") {
            InnerTubeResolver.resolveAudioUrl(song.videoId)  // device-side
        } else {
            song.url  // server-provided URL (local/gdrive)
        }
        val item = MediaItem.fromUri(uri)
        player.setMediaItem(item)
        player.prepare()
        player.play()
    }

    fun play() = player.play()
    fun pause() = player.pause()
    fun seek(position: Float) = player.seekTo((position * 1000).toLong())
    fun getPosition(): Float = player.currentPosition / 1000f
    fun getDuration(): Float = player.duration / 1000f
}
```

### MusicService (MediaSessionService)

```kotlin
class MusicService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayerManager.getInstance(this)
        mediaSession = MediaSession.Builder(this, player)
            .setSessionCallback(/* handles media commands */)
            .build()
        // Notification = MediaStyle with play/pause/next/prev
    }
}
```

### InnerTubeResolver

```kotlin
object InnerTubeResolver {
    private val client = HttpClient(OkHttp) {
        install(ContentNegotiation) { json() }
    }

    suspend fun resolveAudioUrl(videoId: String): String {
        val response = client.post("https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8") {
            setBody(innerTubePlayerBody(videoId))
        }
        val body = response.body<PlayerResponse>()
        val audioFormat = body.streamingData?.formats
            ?.filter { it.mimeType.startsWith("audio/") }
            ?.maxByOrNull { it.bitrate }
        return audioFormat?.url ?: throw Exception("No audio stream found")
    }
}
```

---

## 7. UI Screens (Jetpack Compose)

### LandingScreen
- Text input for name, optional room code
- "Create Room" and "Join Room" buttons
- Connects socket, emits `room:create` or `room:join`

### RoomScreen (main layout)
```
┌─────────────────────────────────────┐
│  Wojo Music             Share Leave │  ← top bar
├─────────────────────────────────────┤
│  Queue                               │  ← collapsible section (default open)
│  ┌─── songs list ─────────────────┐ │
│  │  Currently playing: ...        │ │
│  │  1. Song A                      │ │
│  │  2. Song B                      │ │
│  └──────────────────────────────────┘ │
├─────────────────────────────────────┤
│  Tab: [Chat] [Search]               │  ← tabs in bottom area
│  ┌─── chat / search ──────────────┐ │
│  │  messages / results            │ │
│  └──────────────────────────────────┘ │
├─────────────────────────────────────┤
│  [◄] [►] 0:42 ────▓──── 3:20      │  ← player bar (always visible)
│  📋 Queue │ 🔍 Search │ 👥 People   │  ← action badges
└─────────────────────────────────────┘
```

### PlayerBar (compact)
- Shows current song title + artist
- Position/duration progress bar
- Play/pause button
- Tap to expand to FullPlayerSheet

### FullPlayerSheet (bottom sheet)
- Large album art thumbnail
- Title, artist
- Full progress bar with seek
- Play/pause/next/prev controls
- Queue index indicator

### ChatSheet / SearchSheet / QueueSheet / ParticipantsSheet
- All slide up as bottom sheets (matching the mobile web UX)
- Search sheet: input box + debounce → `/api/music-search` → results list → +Add
- Participants sheet: name, avatar initial, role badge (admin/moderator/listener), "you" indicator — mirrors `Participants.jsx` exactly
- `canControl` = `myInfo.role == 'admin' || myInfo.role == 'moderator'` — gates play/pause/seek/reorder/remove buttons (same as web `Room.jsx:165`)
- No kick/promote buttons — server doesn't expose those; role promotion is automatic when admin disconnects

### File upload flow (Android)
```
User taps "Add from device"
  → ActivityResultContracts.OpenDocument("audio/*")
  → ContentResolver.openInputStream(uri)
  → Read bytes into ByteArray (max 30MB, warn if larger)
  → socket.emit("file:upload", { roomId, fileBuffer: bytes, fileName, fileType }, callback)
  → On success { success, file }: socket.emit("queue:add", { roomId, song: { title, url: file.publicUrl, source: 'local' } })
  → Server broadcasts queue:updated → all clients see it
```

**Socket binary payload**: The Java/Kotlin socket.io-client (`io.socket:socket.io-client`) supports `byte[]` as an emit argument. The `fileBuffer` field arrives at the server as a Node.js Buffer — same as the web client's ArrayBuffer.

**File size**: Enforce the same 30MB limit as the web client. Show a snackbar/toast if exceeded. Read the file in chunks if needed, but for <30MB a single read is fine.

### Role & control parity (matches web `Room.jsx:165`, `Participants.jsx`, `Chat.jsx:225-228`)
- `canControl` state computed from `myInfo.role`
- Role badges displayed in Participants sheet with same color coding (admin = gold, moderator = blue, listener = grey)
- Chat messages from admin/moderator show a small role badge next to the sender name

---

## 8. Implementation Order

| Step | Task | Files | Notes |
|------|------|-------|-------|
| 1 | Gradle project setup | `settings.gradle.kts`, `app/build.gradle.kts`, `libs.versions.toml` | Kotlin 2.x, Compose, Hilt, socket.io-client, ExoPlayer, Ktor |
| 2 | Socket.io client wrapper | `SocketClient.kt`, `Models.kt`, `WojoSocketService.kt` | Connect/disconnect, event dispatch, StateFlow exposure |
| 3 | Landing screen | `LandingScreen.kt`, `MainActivity.kt`, `WojoApp.kt` | Create/join room flow |
| 4 | Room screen + player bar | `RoomScreen.kt`, `PlayerBar.kt` | Basic queue display, play/pause buttons |
| 5 | ExoPlayer + MusicService | `ExoPlayerManager.kt`, `MusicService.kt` | Background playback, media notification |
| 6 | SyncManager | `SyncManager.kt` | Progress reporting + drift correction |
| 7 | InnerTubeResolver | `InnerTubeResolver.kt` | YouTube audio stream resolution |
| 8 | Queue sheet | `QueueSheet.kt` | Full queue with reorder/remove |
| 9 | Chat | `ChatPanel.kt` | Messages list + input |
| 10 | Search sheet | `SearchSheet.kt` | YouTube search + add to queue |
| 11 | File upload | `UploadSheet.kt` (or inside SourceSelector sheet) | SAF file picker → read bytes → emit `file:upload` → `queue:add` |
| 12 | Participants sheet | `ParticipantsSheet.kt` | Participant list with role badges, "you" indicator |
| 13 | Full player sheet | `FullPlayerSheet.kt` | Expanded player controls |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|---|
| InnerTube API changes (YouTube changes format/endpoint) | Use youtubei.js pattern of managing client version. The Kotlin models mirror the JSON structure; only the version string needs updating. |
| Android socket.io-client library compatibility | `io.socket:socket.io-client:2.1.0` is mature and widely used. Fallback: raw OkHttp WebSocket with socket.io protocol framing. |
| Server-side song state drift (Android pauses/resumes independently) | SyncManager runs periodic drift correction. The `player:sync` handshake + `lastUpdated` live-position calculation works identically to the web client. |
| Large file uploads over socket.io (30MB binary payload) | Files > 10MB risk socket.io message fragmentation. Mitigation: show upload progress, use WebSocket-only transport (no XHR polling). If problematic, add a dedicated HTTP POST `/api/upload` endpoint on the server. |

---

## 10. What is NOT in scope (first version)

- Android Auto custom layout — ExoPlayer MediaSession provides automatic basic controls, but no custom driving-optimized UI
- Offline downloads — ExoPlayer can cache streams, but no dedicated download manager UI or "download for offline" button
- Notifications for join requests — the web server doesn't have an approval flow
- Room reordering persistence — Android follows the same ephemeral room model as the web client