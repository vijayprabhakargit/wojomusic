# Wojo Music - Design Document

## 1. Overview

Wojo Music is a real-time synchronized music player where multiple users can join a virtual room, add songs to a shared queue, and listen to music together in perfect sync. The UI is themed after a retro cassette player.

## 2. Design Decisions

### 2.1. No Database Persistence

**Decision**: In-memory storage only.

**Rationale**: Rooms are ephemeral - they exist only while participants are connected. When the last participant leaves, the room and all its data are destroyed. This eliminates the need for database setup, migration management, and persistence concerns on free-tier hosting.

**Implications**:
- Room IDs are generated and valid only for the session lifetime
- Queue state, chat history, and playback position are lost when room is empty
- Server restart clears all rooms
- File cleanup is coupled with room deletion

### 2.2. File Size Limit: 30MB

**Decision**: Maximum 30MB per uploaded audio file.

**Rationale**: Based on Render free tier constraints (512MB RAM, ~50GB storage):
- Multiple concurrent uploads could exhaust memory
- A 30MB MP3 is approximately 30 minutes of audio at 128kbps - sufficient for most songs
- Large files take longer to upload/download, causing sync issues
- Storage is cleaned up when rooms are deleted

### 2.3. Browser-based Upload, Server-side Streaming

**Decision**: Files are uploaded from browser → server storage → streamed to all clients.

**Rationale**:
- All participants need access to the same audio file regardless of their device/location
- Server acts as a central source of truth for audio data
- Enables pre-fetching (download next song while current plays)
- Avoids P2P complexity and NAT traversal issues

### 2.4. Google Drive: Public Links Only

**Decision**: Use public shareable Google Drive links (no OAuth).

**Rationale**:
- OAuth flow adds significant complexity (redirects, token management, refresh tokens)
- Public links are simpler and sufficient for the use case
- Users control access via Google Drive's share settings
- Server downloads the file using a direct download URL (resolved from the share link)

### 2.5. Pre-fetching Strategy

**Decision**: Download the next song in queue while current song plays.

**Flow**:
1. Song A starts playing → immediately begin downloading Song B (if from GDrive)
2. Clients stream from server's local copy
3. When Song A finishes → Song B is already cached → instant transition
4. Clean up Song A's file after Song B starts playing
5. Local uploads are already on server → no pre-fetch needed

**Benefit**: Eliminates buffering delay between songs, creating a seamless listening experience.

### 2.6. Sync Strategy

**Decision**: Controller-based time synchronization with correction.

**Architecture**:
- The **authoritative controller** (admin or moderator who last pressed play/pause/seek) sends periodic progress reports to the server
- Server broadcasts the current playback state (isPlaying, position, lastUpdated timestamp) to all clients
- **Non-controller clients** play/pause based on server state and periodically check for drift
- If drift exceeds 2 seconds, server sends a correction

**Sync Flow**:
```
Controller Client          Server           Other Clients
     │                       │                    │
     │── play/pause/seek ──►│                    │
     │                       │── broadcast ────►│
     │                       │  {isPlaying,     │
     │                       │   position,       │
     │── progress (1s) ───► │   lastUpdated}    │
     │                       │                    │
     │                       │◄── sync check ──►│
     │                       │  (drift > 2s?     │
     │                       │   → correction)   │
```

**Late Joiner Flow**:
1. Client joins room → receives current `playerState`
2. Calculates expected position: `serverPosition + (now - lastUpdated)`
3. Seeks audio to that position and starts playing (if playing)
4. Result: late joiners are instantly in sync

### 2.7. Role System

**Decision**: Three-tier role system with automatic promotion.

| Role | Privileges |
|------|-----------|
| **Admin** (room creator) | Full control - play, pause, seek, skip, reorder/remove queue, chat |
| **Moderator** | Same as Admin minus auto-promotion |
| **Listener** | Can add songs to queue, chat, and listen only |

- First person in room is always admin
- When admin leaves, the next moderator (or oldest participant if no moderator) is promoted
- Promoted user receives a `role:promoted` event

### 2.8. Room ID Format

**Decision**: 6-character alphanumeric (excluding ambiguous characters).

- Uses: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0, O, 1, I to avoid confusion)
- Case-insensitive input (converted to uppercase)
- Room IDs are unique and regenerated on collision

### 2.9. No Audio Transcoding

**Decision**: Stream audio files in their original format.

**Rationale**:
- Browsers support MP3, WAV, OGG, FLAC, AAC natively
- Transcoding adds significant server CPU load
- File size limits prevent extremely large files
- Can be added later as an enhancement

## 3. API Design

### 3.1. Socket.IO Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ name, role }` | Create a new room |
| `room:join` | `{ roomId, name, role }` | Join existing room |
| `room:leave` | `{ roomId }` | Leave room |
| `file:upload` | `{ roomId, fileBuffer, fileName, fileType }` | Upload audio file |
| `queue:add` | `{ roomId, song }` | Add song to queue |
| `queue:remove` | `{ roomId, songId }` | Remove song from queue (mod+) |
| `queue:reorder` | `{ roomId, fromIndex, toIndex }` | Reorder queue (mod+) |
| `player:play` | `{ roomId }` | Start/resume playback (mod+) |
| `player:pause` | `{ roomId }` | Pause playback (mod+) |
| `player:seek` | `{ roomId, position }` | Seek to position (mod+) |
| `player:next` | `{ roomId }` | Skip to next (mod+) |
| `player:previous` | `{ roomId }` | Go to previous (mod+) |
| `player:progress` | `{ roomId, position }` | Report playback progress (mod+) |
| `player:sync` | `{ roomId, clientPosition, clientTimestamp }` | Request sync check |
| `chat:message` | `{ roomId, message }` | Send chat message |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room:joined` | `{ roomId, participant, participants, queue, playerState }` | Room join confirmation |
| `participants:update` | `[participant]` | Participant list changed |
| `queue:updated` | `[queueItem]` | Queue changed |
| `player:state` | `{ currentSong, currentIndex, isPlaying, position, lastUpdated }` | Playback state changed |
| `player:ended` | empty | Queue ended |
| `chat:message` | `{ id, sender, message, timestamp, role }` | New message |
| `chat:system` | `string` | System notification |
| `role:promoted` | `{ role }` | User's role changed |

### 3.2. Song Object

```json
{
  "id": "uuid",
  "title": "Song Name",
  "fileName": "song.mp3",
  "url": "/uploads/roomId/fileId.mp3",
  "filePath": "/absolute/path/to/file.mp3",
  "publicUrl": "/uploads/roomId/fileId.mp3",
  "streamUrl": "/uploads/roomId/fileId.mp3",
  "fileType": "audio/mpeg",
  "duration": 0,
  "addedBy": "Username",
  "addedById": "socketId",
  "addedAt": 1700000000000,
  "source": "local" | "gdrive"
}
```

## 4. Security Considerations

- No authentication required (by design for simplicity)
- File size limits prevent resource exhaustion
- Room IDs are unguessable (alphanumeric, 6 chars → ~34M combinations)
- Uploaded files are only accessible within room context
- Chat messages are limited to 500 characters
- No SQL injection surface (no database)
- Socket.IO maxHttpBufferSize: 50MB

## 5. Performance

- Server memory scales with number of concurrent rooms × files
- With 30MB max file size and 3-song pre-fetch buffer:
  - Max ~90MB per room for file storage
  - Plus ~1MB per participant for socket connections
- Render free tier (512MB) can comfortably handle 3-4 concurrent rooms

## 6. Browser Compatibility

- Requires HTML5 Audio API support
- Recommended browsers: Chrome, Firefox, Safari, Edge
- Mobile: iOS Safari, Android Chrome
- Audio formats vary by browser; MP3 has widest support

## 7. Future Considerations

- **Authentication** - Simple password protection for rooms
- **Persistence** - Optional database for room history
- **Transcoding** - Server-side audio conversion for unsupported formats
- **CDN** - Offload file storage to CDN for better scaling
- **Volume Control** - Per-participant volume adjustment
- **Playlist Import** - From Spotify, YouTube, local files