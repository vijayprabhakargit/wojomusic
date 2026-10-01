# 🐱 Wojo Music - Sync Music Player

> **🌐 Live at [https://wojomusic.onrender.com](https://wojomusic.onrender.com)**

A real-time synchronized music player with a retro cassette player aesthetic. Create rooms, invite friends, and listen to music together in perfect sync.

## 🎯 Features

- **Room-based Music Streaming**: Create or join rooms with a shareable 6-character room ID
- **Real-time Sync**: All participants hear the same song at the same position - like a shared radio
- **Cassette Player UI**: Retro skeuomorphic design with spinning tape reels and audio visualizer
- **Multiple Music Sources**:
  - Upload audio files from your device (MP3, WAV, OGG, FLAC, etc.)
  - Add public Google Drive share links
  - **Paste YouTube links** — fetches title & duration, extracts audio when the song reaches the top of the queue (supports video, Shorts, youtu.be links)
- **Smart Pre-fetching**: Downloads next songs in the background while current song plays
- **Role-based Access**: Admin → full control, Moderator → control playback & queue, Listener → only add songs & chat
- **Live Chat**: Built-in chat room for participants
- **Participant Management**: See who's in the room, with role badges
- **Mobile Responsive**: Works on both desktop and mobile devices
- **Auto-cleanup**: Rooms are deleted when all participants leave

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Web Frontend** | React 19 + Vite |
| **Android Client** | Kotlin 2.0 + Jetpack Compose + Hilt DI |
| **Backend** | Node.js + Express |
| **Real-time** | Socket.IO (WebSocket + Polling) |
| **Styling** | Custom CSS (retro cassette theme) |
| **File Storage** | Server filesystem (in-memory room state) |
| **YouTube** | yt-dlp (via youtube-dl-exec) — audio extraction & metadata |
| **InnerTube** | Android-native YouTube stream resolver via Ktor (device-side) |
| **Playback (Android)** | ExoPlayer + MediaSessionService (background playback) |
| **Font** | Share Tech Mono (Google Fonts) |

## 📋 Prerequisites

- Node.js 18+
- npm 9+
- **Android client only:** Android SDK 35+ (via Android Studio), JDK 17, Gradle 8.6+

## 🚀 Quick Start

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install
cd ..

# Start in development mode
npm run dev
```

This starts:
- **Server** at http://localhost:3001
- **Client** at http://localhost:5173 (with proxy to server)

### Production Build

```bash
# Build web client
cd client && npm run build

# Start server (serves client build + API)
cd ../server && npm start

# Build android client (requires Android SDK)
cd ../android-client && ./gradlew assembleDebug
```

Server will be at http://localhost:3001 serving both API and client.

The Android client debug build (`assembleDebug`) produces an APK at:
```
android-client/app/build/outputs/apk/debug/app-debug.apk
```

### Build All Targets (from repo root)

```bash
# Web client + server
npm run build

# Android client only
npm run build:android

# Web client only
npm run build:web
```

## 🏗 Project Structure

```
wojomusic/
├── server/
│   ├── index.js          # Express + Socket.IO server
│   ├── rooms.js          # Room state management (in-memory)
│   ├── fileHandler.js    # File upload/download/cleanup
│   ├── uploads/          # Uploaded audio files (auto-created)
│   └── package.json
├── client/               # Web frontend (React + Vite)
│   ├── public/
│   │   └── favicon.svg   # Cat-with-headphones logo
│   ├── src/
│   │   ├── App.jsx          # Main app with page routing
│   │   ├── index.css        # Retro cassette CSS theme
│   │   ├── hooks/
│   │   │   └── useSocket.js # Socket.IO connection hook
│   │   ├── pages/
│   │   │   ├── Landing.jsx  # Create/join room page
│   │   │   └── Room.jsx     # Main music room page
│   │   └── components/
│   │       ├── WalkmanPlayer.jsx  # Cassette player UI
│   │       ├── SourceSelector.jsx # File/GDrive/YouTube source picker
│   │       ├── QueuePanel.jsx     # Song queue list
│   │       ├── Chat.jsx           # Live chat + participants
│   │       └── Participants.jsx   # Participant list view
│   ├── package.json
│   └── vite.config.js
├── android-client/        # Android native app (Kotlin + Compose)
│   ├── build.gradle.kts      # Root Gradle build (plugins)
│   ├── settings.gradle.kts   # Module config
│   ├── gradle/
│   │   ├── libs.versions.toml # Version catalog
│   │   ├── gradle.properties  # Gradle settings
│   │   └── wrapper/           # Gradle wrapper
│   ├── app/
│   │   ├── build.gradle.kts  # App module (Compose, ExoPlayer, socket.io)
│   │   ├── proguard-rules.pro
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── res/           # Icons, themes
│   │       └── kotlin/com/wojo/music/
│   │           ├── WojoApp.kt         # Hilt Application
│   │           ├── MainActivity.kt    # Single Activity with NavHost
│   │           ├── WojoColors.kt      # Color scheme
│   │           ├── service/           # MusicService, WojoSocketService
│   │           ├── protocol/          # Models, SocketClient, SyncManager
│   │           ├── playback/          # ExoPlayerManager, InnerTubeResolver
│   │           ├── ui/                # LandingScreen, RoomScreen, PlayerBar,
│   │           │                      # QueueSheet, ChatPanel, SearchSheet,
│   │           │                      # ParticipantsSheet, FullPlayerSheet,
│   │           │                      # SourceSelectorSheet
│   │           └── di/                # NetworkModule, SocketModule
│   └── local.properties   # Android SDK path override
└── package.json            # Root monorepo scripts
```

## 🎮 How to Use

### Creating a Room
1. Open the app → **Create Room** tab
2. Enter your name
3. Choose your role (Moderator or Listener)
4. Click "Create Music Room"
5. Share the 6-character Room ID with friends

### Joining a Room
1. Open the app → **Join Room** tab
2. Enter your name
3. Enter the 6-character Room ID
4. Choose your role (Moderator or Listener)
5. Click "Join Room"

### Adding Music
1. Click **"Add Song"** on the player
2. Choose **"From My Device"** → select audio files (max 30MB each)
3. Choose **"Google Drive"** → paste a public share link
4. OR choose **"YouTube"** → paste a YouTube video or Shorts link (title/duration fetched automatically)
5. Songs are added to the queue and play automatically

> 💡 **YouTube songs** are downloaded as audio when they reach the top of the queue, then cached and streamed to all participants — same deferred-download pattern as Google Drive. Powered by yt-dlp behind the scenes.

### Player Controls (Admin/Moderator only)
- ▶️ **Play** / ⏸ **Pause**
- ⏮ **Previous** / ⏭ **Next**
- Click on **progress bar** to seek
- Drag queue items to reorder (Admin/Mod only)

## 🔐 Roles

| Role | Add Songs | Play/Pause | Seek | Reorder/Remove Queue | Chat |
|------|-----------|------------|------|---------------------|------|
| **Admin** (room creator) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Moderator** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Listener** | ✅ | ❌ | ❌ | ❌ | ✅ |

When the admin leaves, the next moderator or listener is promoted to admin.

## 🌐 Deployment (Render)

This app is deployed on Render's free tier:

**Live URL:** [https://wojomusic.onrender.com](https://wojomusic.onrender.com)

```yaml
# Render Service Configuration
services:
  - type: web
    name: wojomusic
    runtime: node
    plan: free
    buildCommand: npm run build
    startCommand: cd server && node index.js
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: CLIENT_URL
        value: "https://wojomusic.onrender.com"
```

**Resource Limits Consideration:**
- Render free tier: 512MB RAM, ~50GB storage
- Max file size: 30MB per song (configurable)
- Files are cleaned up when rooms are deleted

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| CLIENT_URL | * | CORS origin for production |

## 🧹 Cleanup

- Rooms are auto-deleted when the last participant leaves
- Uploaded files are deleted with the room
- No database involved - fully in-memory

## 🔮 Future Roadmap

A bold vision to evolve Wojo Music into a cross-platform, multi-source music sync ecosystem.

### 🎬 Ad-Free YouTube Streamer

✅ **Done:** Paste a YouTube link → fetches title & duration → adds to queue → downloads audio when it reaches the top (deferred-download pattern).

**Still to explore:**
- Searching and playing YouTube videos without ads or third-party embeds
- **Unlimited queue** for YouTube sources (no 20-song LRU cap — that applies only to local uploads to conserve server storage)
- Playlist support — drop a YouTube playlist URL and let it queue up
- Voteskipping: room participants can vote to skip the current song (majority wins)

### 🎧 Spotify & Amazon Music Integration

**Spotify:**
- Use the [Spotify Web API](https://developer.spotify.com/documentation/web-api/) to:
  - Log in with Spotify OAuth to access library, playlists, and recommendations
  - Search tracks, albums, and artists directly from Wojo
  - Pull playlist metadata and queue songs up for the room
  - Future: actual audio streaming via Spotify Connect SDK for premium users

**Amazon Music / Playlist Import:**
- Generic playlist file import: upload .m3u, .m3u8, .pls — extract song metadata and queue them
- Support pasting raw playlist URLs from various services
- Future: Apple Music via MusicKit JS

### 📱 Android Native Client

✅ **Done:** Native Android app (Kotlin + Jetpack Compose) sharing the same server.
- Uses the same Socket.IO protocol — events, rooms, queue, chat all shared seamlessly
- ExoPlayer for audio with background playback via MediaSessionService
- InnerTube YouTube stream resolution (device-side, no PoToken needed)
- Hilt DI for dependency injection
- Full UI parity: Landing, Room, PlayerBar, Queue, Chat, Search, Participants, FullPlayer sheets

**Still to explore:**
- Side-load or publish on the Play Store
- Proper signing and CI/CD pipeline
- End-to-end testing on real Android devices

### 🎨 Classic iPod UI Revamp

Reimagine the interface with a **click-wheel inspired layout** while keeping the retro cassette aesthetic:
- **Click-wheel navigation**: circular menu for switching between Now Playing, Queue, Chat, Sources, Settings
- **Monochrome-ish palette**: keep the warm amber/gold accents but add crisp white-on-dark LCD-style text
- **Smooth scroll wheel interaction**: on desktop via mouse drag/scroll, on mobile via touch rotation
- **Visual polish**: LCD-style font treatment, subtle scanline overlay, glowing backlight effect on the “screen”
- The cassette tape reels remain as a Now Playing visualizer — best of both worlds

### 🎉 Fun Social Features (Spotify Jam + Community)

- **👥 Spotify Jam-style co-listening**: any room participant can add songs to the shared queue (configurable per room)
- **📊 Listening stats**: per-session stats showing who added the most songs, most-played genres, total listening time
- **🎤 Song requests & dedications**: chat-integrated features where you can !request Song - Artist or !dedicate Song - Artist @username
- **🎯 Voting system**: room polls for skipping, replaying, or voting songs to the top of the queue
- **🎵 Shared Now Playing screen**: a beautiful full-screen view showing album art, lyrics, and participant reactions (emojis float across the screen in real-time)
- **📋 Collaborative playlists**: save the current room queue as a shared playlist that persists across sessions
- **🔔 Join/Leave sounds**: optional retro chime when someone joins or leaves the room (like old chat rooms)
- **🏆 Achievement badges**: First Song, DJ MVP, Night Owl, Crowd Pleaser — earned by activity
- **🌙 Dark mode toggle**: already dark-themed, but add an even deeper midnight OLED-friendly variant

---



### Quick Wins (shorter-term)

- [x] **YouTube link support** — paste a link to add to queue (now supports video, Shorts, youtu.be links)
- [ ] **Playlist import** — upload .m3u, .m3u8, .pls files or paste playlist URLs
- [ ] **Volume control per participant** — each person adjusts their own volume
- [ ] **Song duration display in queue** — show how long each song is
- [ ] **Admin password protection** — password-protect room creation
- [ ] **Room history / now playing screen** — show recently played songs
- [ ] **Audio transcoding** — convert unsupported formats server-side for broad compatibility


*Got ideas or want to contribute? Open an issue or PR on [GitHub](https://github.com/vijayprabhakargit/wojomusic).*