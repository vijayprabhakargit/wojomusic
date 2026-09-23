# 📼 Walkman Room - Sync Music Player

A real-time synchronized music player with a retro Walkman/cassette player aesthetic. Create rooms, invite friends, and listen to music together in perfect sync.

## 🎯 Features

- **Room-based Music Streaming**: Create or join rooms with a shareable 6-character room ID
- **Real-time Sync**: All participants hear the same song at the same position - like a shared radio
- **Walkman Cassette UI**: Retro skeuomorphic design with spinning tape reels and audio visualizer
- **Multiple Music Sources**:
  - Upload audio files from your device (MP3, WAV, OGG, FLAC, etc.)
  - Add public Google Drive share links
- **Smart Pre-fetching**: Downloads next songs in the background while current song plays
- **Role-based Access**: Admin → full control, Moderator → control playback & queue, Listener → only add songs & chat
- **Live Chat**: Built-in chat room for participants
- **Participant Management**: See who's in the room, with role badges
- **Mobile Responsive**: Works on both desktop and mobile devices
- **Auto-cleanup**: Rooms are deleted when all participants leave

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite |
| **Backend** | Node.js + Express |
| **Real-time** | Socket.IO (WebSocket + Polling) |
| **Styling** | Custom CSS (retro cassette theme) |
| **File Storage** | Server filesystem (in-memory room state) |
| **Font** | Share Tech Mono (Google Fonts) |

## 📋 Prerequisites

- Node.js 18+
- npm 9+

## 🚀 Quick Start

`ash
# Install dependencies
cd server && npm install
cd ../client && npm install
cd ..

# Start in development mode
npm run dev
`

This starts:
- **Server** at http://localhost:3001
- **Client** at http://localhost:5173 (with proxy to server)

### Production Build

`ash
# Build client
cd client && npm run build

# Start server (serves client build + API)
cd ../server && npm start
`

Server will be at http://localhost:3001 serving both API and client.

## 🏗 Project Structure

`
wojomusic/
├── server/
│   ├── index.js          # Express + Socket.IO server
│   ├── rooms.js          # Room state management (in-memory)
│   ├── fileHandler.js    # File upload/download/cleanup
│   ├── uploads/          # Uploaded audio files (auto-created)
│   └── package.json
├── client/
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
│   │       ├── SourceSelector.jsx # File/GDrive source picker
│   │       ├── QueuePanel.jsx     # Song queue list
│   │       ├── Chat.jsx           # Live chat + participants
│   │       └── Participants.jsx   # Participant list view
│   ├── package.json
│   └── vite.config.js
└── package.json
`

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
3. OR choose **"Google Drive"** → paste a public share link
4. Songs are added to the queue and play automatically

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

This app is designed for Render free tier deployment:

`yaml
# Render Service Configuration
services:
  - type: web
    name: music-room
    env: node
    buildCommand: |
      cd client && npm install && npm run build
      cd ../server && npm install
    startCommand: cd server && node index.js
`

**Resource Limits Consideration:**
- Render free tier: 512MB RAM, ~50GB storage
- Max file size: 30MB per song (configurable)
- Files are cleaned up when rooms are deleted

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| CLIENT_URL | * | CORS origin (CORS origin URL for production) |

## 🧹 Cleanup

- Rooms are auto-deleted when the last participant leaves
- Uploaded files are deleted with the room
- No database involved - fully in-memory

## 🔮 Future Enhancements

- [ ] YouTube/SoundCloud link support
- [ ] Playlist import (M3U, Spotify, etc.)
- [ ] Volume control per participant
- [ ] Song duration display in queue
- [ ] Admin password protection for rooms
- [ ] Room history / now playing screen
- [ ] Audio transcoding for compatibility
