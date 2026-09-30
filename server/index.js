const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const RoomManager = require('./rooms');
const FileHandler = require('./fileHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 50 * 1024 * 1024 // 50MB max for socket transfers
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Initialize managers
const roomManager = new RoomManager();
const fileHandler = new FileHandler(uploadsDir, 30 * 1024 * 1024); // 30MB max

// YouTube audio streaming proxy
// NOTE: must be registered BEFORE the SPA catch-all below, otherwise the
// catch-all intercepts /api/* requests and serves index.html.
app.get('/api/youtube-audio/:videoId', fileHandler.createYouTubeProxy());
// Production diagnostics: egress IP, identity state and per-client status
// matrix. Protect with YT_DEBUG_KEY when set in production.
app.get('/api/yt-debug', async (req, res) => {
  const key = process.env.YT_DEBUG_KEY;
  if (key && req.query.key !== key) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const youtube = await import('./youtube.mjs');
    const videoId = String(req.query.videoId || 'dQw4w9WgXcQ');
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid videoId' });
    }
    const singleClient = String(req.query.client || '').trim();
    const result = singleClient
      ? await youtube.diagnose(videoId, { clients: [singleClient] })
      : await youtube.diagnose(videoId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Production debug: run the REAL YouTube path (the same getYoutubeInfo /
// getStreamUrl calls the socket flow makes) against a user-supplied URL or
// videoId and return the full trace. Complements /api/yt-debug, whose
// diagnose() only probes raw getBasicInfo and does not exercise the
// fallback chain, format selection or decipher step that production uses.
// Usage: /api/yt-debug-info?url=<full YouTube URL>[&stream=1]
app.get('/api/yt-debug-info', async (req, res) => {
  const key = process.env.YT_DEBUG_KEY;
  if (key && req.query.key !== key) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const raw = String(req.query.url || req.query.videoId || '').trim();
  if (!raw) return res.status(400).json({ error: 'Missing url or videoId' });
  const videoId = fileHandler._extractVideoId(raw);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  const youtube = await import('./youtube.mjs');
  youtube.clearDebugLog();
  const out = { input: raw, videoId: videoId, startedAt: new Date().toISOString() };

  // Phase 1: metadata - the exact call the "add to queue" socket flow makes
  let t0 = Date.now();
  try {
    const info = await fileHandler.getYoutubeInfo(raw);
    out.infoResult = { ok: true, elapsedMs: Date.now() - t0, info: info };
  } catch (err) {
    out.infoResult = {
      ok: false, elapsedMs: Date.now() - t0,
      errorName: err && err.name, errorMessage: err && err.message,
      stack: err && err.stack,
    };
  }

  // Phase 2 (opt-in, stream=1): resolve a real CDN stream URL
  if (/^(1|true|yes)$/i.test(String(req.query.stream || ''))) {
    t0 = Date.now();
    try {
      const stream = await fileHandler.getYouTubeStreamUrl(videoId);
      out.streamResult = {
        ok: true, elapsedMs: Date.now() - t0,
        mimeType: stream.mimeType, contentLength: stream.contentLength,
        urlHost: stream.url ? new URL(stream.url).host : null,
        hasPot: stream.url ? stream.url.includes('pot=') : null,
      };
    } catch (err) {
      out.streamResult = {
        ok: false, elapsedMs: Date.now() - t0,
        errorName: err && err.name, errorMessage: err && err.message,
        stack: err && err.stack,
      };
    }
  }

  out.identity = youtube.identityInfo();
  out.debugLog = youtube.getDebugLog();
  res.json(out);
});

// Music catalog search (YouTube Music). Primary UX: search a song, get
// track results sorted by YouTube relevance, then play via the existing
// /api/youtube-audio proxy.  Supports lazy-load pagination: the initial
// search returns a continuation token, POST /api/music-search/more with
// that token to fetch the next page.
app.get('/api/music-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q' });
  try {
    const youtube = await import('./youtube.mjs');
    const { results, continuation } = await youtube.searchCatalog(q);
    res.json({ query: q, results, continuation });
  } catch (err) {
    console.error('Music search failed: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Continuation: fetch the next page of search results.
// Body: { continuation: "<token from previous response>" }
app.post('/api/music-search/more', async (req, res) => {
  const token = String(req.body?.continuation || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing continuation token' });
  try {
    const youtube = await import('./youtube.mjs');
    const { results, continuation } = await youtube.searchCatalogMore(token);
    res.json({ results, continuation });
  } catch (err) {
    console.error('Music search continuation failed: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve client build in production
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/socket.io') && !req.path.startsWith('/uploads') && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
  console.log('[~] Serving client build from', clientDist);
}

// ===================== SOCKET.IO HANDLERS =====================

io.on('connection', (socket) => {
  console.log(`[+] User connected: ${socket.id}`);

  // ---- ROOM MANAGEMENT ----

  socket.on('room:create', ({ name, role = 'admin' }, callback) => {
    try {
      const room = roomManager.createRoom();
      const participant = roomManager.addParticipant(room.id, socket.id, { name, role });
      socket.join(room.id);
      socket.emit('room:joined', {
        roomId: room.id,
        participant,
        participants: roomManager.getParticipants(room.id),
        queue: roomManager.getQueue(room.id),
        playerState: roomManager.getPlayerState(room.id)
      });
      io.to(room.id).emit('participants:update', roomManager.getParticipants(room.id));
      callback({ success: true, roomId: room.id });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('room:join', ({ roomId, name, role = 'listener' }, callback) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) return callback({ success: false, error: 'Room not found' });
      
      const participant = roomManager.addParticipant(roomId, socket.id, { name, role });
      socket.join(roomId);
      socket.emit('room:joined', {
        roomId,
        participant,
        participants: roomManager.getParticipants(roomId),
        queue: roomManager.getQueue(roomId),
        playerState: roomManager.getPlayerState(roomId)
      });
      io.to(roomId).emit('participants:update', roomManager.getParticipants(roomId));
      io.to(roomId).emit('chat:system', `${name} joined the room`);
      callback({ success: true, roomId });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('room:leave', ({ roomId }) => {
    handleLeave(roomId);
  });

  socket.on('disconnect', () => {
    // Find which rooms this socket was in
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(roomId => handleLeave(roomId));
    console.log(`[-] User disconnected: ${socket.id}`);
  });

  function handleLeave(roomId) {
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant) return;
    
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const wasAdmin = participant.role === 'admin';
    const removed = roomManager.removeParticipant(roomId, socket.id);
    socket.leave(roomId);

    if (removed) {
      io.to(roomId).emit('participants:update', roomManager.getParticipants(roomId));
      io.to(roomId).emit('chat:system', `${participant.name} left the room`);

      // If admin left, promote the next moderator or admin
      if (wasAdmin) {
        const participants = roomManager.getParticipants(roomId);
        if (participants.length > 0) {
          const nextAdmin = participants.find(p => p.role === 'moderator') || participants[0];
          roomManager.updateParticipantRole(roomId, nextAdmin.id, 'admin');
          io.to(roomId).emit('participants:update', roomManager.getParticipants(roomId));
          io.to(roomId).emit('chat:system', `${nextAdmin.name} is now the admin`);
          io.to(nextAdmin.id).emit('role:promoted', { role: 'admin' });
        }
      }

      // If room is empty, cleanup
      if (roomManager.getRoom(roomId) && roomManager.getParticipants(roomId).length === 0) {
        roomManager.deleteRoom(roomId);
        fileHandler.cleanupRoomFiles(roomId);
        console.log(`[~] Room ${roomId} deleted (empty)`);
      }
    }
  }

  // ---- FILE UPLOAD (Local) ----

  socket.on('file:upload', ({ roomId, fileBuffer, fileName, fileType }, callback) => {
    try {
      const participant = roomManager.getParticipantBySocketId(socket.id);
      if (!participant) return callback({ success: false, error: 'Not in a room' });

      const fileRecord = fileHandler.saveUploadedFile(roomId, fileBuffer, fileName, fileType);
      callback({ success: true, file: fileRecord });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ---- YOUTUBE ADD ----

  socket.on('youtube:add', ({ roomId, url }, callback) => {
    try {
      const participant = roomManager.getParticipantBySocketId(socket.id);
      if (!participant) return callback({ success: false, error: 'Not in a room' });

      const room = roomManager.getRoom(roomId);
      if (!room) return callback({ success: false, error: 'Room not found' });

      // Validate YouTube URL
      const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i;
      if (!youtubeRegex.test(url.trim())) {
        return callback({ success: false, error: 'Invalid YouTube URL. Example: https://www.youtube.com/watch?v=...' });
      }

            // Extract videoId so clients can play via the YouTube IFrame Player
      // API (no server-side InnerTube / bot-check involved).
      const videoId = fileHandler._extractVideoId(url.trim());
      if (!videoId) {
        return callback({ success: false, error: 'Could not extract a video ID from that URL' });
      }

      // Fetch video info from YouTube. The InnerTube path may fail with a bot
      // check on server IPs, so fall back to the public oEmbed endpoint
      // (title only, never bot-checked) before giving up.
      const fetchMeta = fileHandler.getYoutubeInfo(url.trim())
        .then((info) => ({ title: info.title, duration: info.duration || 0 }))
        .catch(() => fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`)
          .then((r) => (r.ok ? r.json() : null))
          .then((meta) => ({ title: (meta && meta.title) || `YouTube ${videoId}`, duration: 0 })));

      fetchMeta
        .then((info) => {
          // Create a title from video title (truncate long titles)
          const title = info.title.length > 100 ? info.title.slice(0, 97) + '...' : info.title;

          const queueItem = roomManager.addToQueue(roomId, {
            title,
            url: url.trim(),
            source: 'youtube',
            videoId,
            duration: info.duration,
            addedBy: participant.name,
            addedById: socket.id,
          });

          // Evict LRU if queue exceeds max size
          const evicted = roomManager.evictLRU(roomId);

          io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));

          if (evicted) {
            io.to(roomId).emit('chat:system', `Queue limit reached — removed "${evicted.title}" (oldest)`);
          }

          io.to(roomId).emit('chat:system', `${participant.name} added "${title}" to queue`);

          // If nothing is playing, start
          if (!room.playerState.currentSong) {
            playNext(roomId);
          } else {
            // If the added song is next in queue, pre-fetch it
            const nextIndex = room.playerState.currentIndex + 1;
            if (nextIndex < room.queue.length && room.queue[nextIndex].id === queueItem.id) {
              preFetchSong(roomId, queueItem);
            }
          }

          callback({ success: true, queueItem });
        })
        .catch((err) => {
          console.error(`YouTube info fetch failed: ${err.message}`);
          callback({ success: false, error: `Could not fetch video info: ${err.message}` });
        });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ---- QUEUE MANAGEMENT ----

  socket.on('queue:add', ({ roomId, song }, callback) => {
    try {
      const participant = roomManager.getParticipantBySocketId(socket.id);
      if (!participant) return callback({ success: false, error: 'Not in a room' });

      const room = roomManager.getRoom(roomId);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const queueItem = roomManager.addToQueue(roomId, {
              ...song,
              addedBy: participant.name,
              addedById: socket.id
            });

            // Evict LRU if queue exceeds max size
            const evicted = roomManager.evictLRU(roomId);

            io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));

            if (evicted) {
              io.to(roomId).emit('chat:system', `Queue limit reached — removed "${evicted.title}" (oldest)`);
            }

            io.to(roomId).emit('chat:system', `${participant.name} added "${song.title || song.fileName}" to queue`);

      // If nothing is playing, start
      if (!room.playerState.currentSong) {
        playNext(roomId);
      } else {
        // If the added song is next in queue (currentIndex + 1), pre-fetch it
        const nextIndex = room.playerState.currentIndex + 1;
        if (nextIndex < room.queue.length && room.queue[nextIndex].id === queueItem.id) {
          preFetchSong(roomId, queueItem);
        }
      }

      callback({ success: true, queueItem });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('queue:remove', ({ roomId, songId }, callback) => {
      try {
        const participant = roomManager.getParticipantBySocketId(socket.id);
        if (!participant || participant.role === 'listener') {
          if (callback) callback({ success: false, error: 'Not authorized' });
          return;
        }
        roomManager.removeFromQueue(roomId, songId);
        io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));
        if (callback) callback({ success: true });
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on('queue:reorder', ({ roomId, fromIndex, toIndex }, callback) => {
      try {
        const participant = roomManager.getParticipantBySocketId(socket.id);
        if (!participant || participant.role === 'listener') {
          if (callback) callback({ success: false, error: 'Not authorized' });
          return;
        }
        roomManager.reorderQueue(roomId, fromIndex, toIndex);
        io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));
        if (callback) callback({ success: true });
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

  // ---- PLAYER CONTROLS ----

  socket.on('player:play', ({ roomId }) => {
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant || participant.role === 'listener') return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // If nothing is playing, start next in queue
    if (!room.playerState.currentSong) {
      playNext(roomId);
      return;
    }

    roomManager.setPlayerState(roomId, { 
      isPlaying: true, 
      lastUpdated: Date.now() 
    });
    io.to(roomId).emit('player:state', roomManager.getPlayerState(roomId));
  });

  socket.on('player:pause', ({ roomId }) => {
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant || participant.role === 'listener') return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    roomManager.setPlayerState(roomId, { 
      isPlaying: false, 
      lastUpdated: Date.now(),
      // Broadcast current position when pausing
      position: room.playerState.position
    });
    io.to(roomId).emit('player:state', roomManager.getPlayerState(roomId));
  });

  socket.on('player:seek', ({ roomId, position }) => {
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant || participant.role === 'listener') return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    roomManager.setPlayerState(roomId, { 
      position: Math.max(0, position),
      lastUpdated: Date.now() 
    });
    io.to(roomId).emit('player:state', roomManager.getPlayerState(roomId));
  });

  socket.on('player:next', ({ roomId }) => {
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant || participant.role === 'listener') return;
    playNext(roomId);
  });

  socket.on('player:previous', ({ roomId }) => {
      const participant = roomManager.getParticipantBySocketId(socket.id);
      if (!participant || participant.role === 'listener') return;

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // If more than 3 seconds in, restart current song
      if (room.playerState.position > 3) {
        roomManager.setPlayerState(roomId, { 
          position: 0,
          lastUpdated: Date.now() 
        });
        io.to(roomId).emit('player:state', roomManager.getPlayerState(roomId));
        return;
      }

      // Otherwise go to previous song
      const prevIndex = room.playerState.currentIndex - 1;
      if (prevIndex >= 0) {
        playSong(roomId, prevIndex);
      }
    });

    socket.on('player:playSpecific', ({ roomId, index }, callback) => {
      try {
        const participant = roomManager.getParticipantBySocketId(socket.id);
        if (!participant || participant.role === 'listener') {
          if (callback) callback({ success: false, error: 'Not authorized' });
          return;
        }

        const room = roomManager.getRoom(roomId);
        if (!room) {
          if (callback) callback({ success: false, error: 'Room not found' });
          return;
        }

        if (index < 0 || index >= room.queue.length) {
          if (callback) callback({ success: false, error: 'Invalid index' });
          return;
        }

        playSong(roomId, index);
        if (callback) callback({ success: true });
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

  socket.on('player:sync', ({ roomId, clientPosition, clientTimestamp }) => {
    // Clients periodically send their position for sync reconciliation
    // Server can decide to push corrections if drift is too large
    const room = roomManager.getRoom(roomId);
    if (!room || !room.playerState.isPlaying) return;

    const serverPosition = room.playerState.position + (Date.now() - room.playerState.lastUpdated) / 1000;
    const drift = Math.abs(serverPosition - clientPosition);
    
    if (drift > 2) {
      // Send correction
      socket.emit('player:state', roomManager.getPlayerState(roomId));
    }
  });

  // ---- SONG PROGRESS REPORT (from admin/mod who is playing) ----

  socket.on('player:progress', ({ roomId, position }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    
    // Only update server position from the admin
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant || participant.role === 'listener') return;

    roomManager.setPlayerState(roomId, { 
      position,
      lastUpdated: Date.now() 
    });
  });

  // ---- CHAT ----

  socket.on('chat:message', ({ roomId, message }) => {
    const participant = roomManager.getParticipantBySocketId(socket.id);
    if (!participant) return;

    const chatMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      sender: participant.name,
      senderId: socket.id,
      message: message.slice(0, 500), // Limit message length
      timestamp: Date.now(),
      role: participant.role
    };

    io.to(roomId).emit('chat:message', chatMessage);
  });

  // ---- HELPERS ----

  function playNext(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const nextIndex = room.playerState.currentIndex + 1;
    if (nextIndex < room.queue.length) {
      playSong(roomId, nextIndex);
    } else {
      // Queue empty
      roomManager.setPlayerState(roomId, {
        currentSong: null,
        currentIndex: -1,
        isPlaying: false,
        position: 0,
        lastUpdated: Date.now()
      });
      io.to(roomId).emit('player:state', roomManager.getPlayerState(roomId));
      io.to(roomId).emit('player:ended');
    }
  }

  function playSong(roomId, index) {
    const room = roomManager.getRoom(roomId);
    if (!room || index < 0 || index >= room.queue.length) return;

    const song = room.queue[index];

        // Mark this song as recently played for LRU tracking
        roomManager.markSongPlayed(roomId, song.id);

        // Check if file is cached, if not, download it
    const processSong = (asReadyBoolean = false) => {
      roomManager.setPlayerState(roomId, {
        currentSong: song,
        currentIndex: index,
        isPlaying: true,
        position: 0,
        lastUpdated: Date.now()
      });
      io.to(roomId).emit('player:state', roomManager.getPlayerState(roomId));
      io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));

      // Clean up previous song's temp file
      if (index > 0) {
        const prevSong = room.queue[index - 1];
        fileHandler.cleanupFile(roomId, prevSong.id);
      }

      // Pre-fetch next song
      if (index + 1 < room.queue.length) {
        preFetchSong(roomId, room.queue[index + 1]);
      }
    };

    // Local uploads served directly from server
    const isLocalUpload = song.url && song.url.startsWith('/uploads/');
    if (isLocalUpload) {
      // Ensure file exists on disk
      const absolutePath = path.join(uploadsDir, song.url.replace('/uploads/', ''));
      if (fs.existsSync(absolutePath)) {
        song.filePath = absolutePath;
        song.streamUrl = song.url; // Already a server-relative path
        processSong();
      } else {
        io.to(roomId).emit('chat:system', `Cannot find local file for "${song.title}"`);
        playNext(roomId);
      }
      return;
    }

    // If song has a cached file path, ensure it exists; otherwise trigger download
    if (song.filePath && fs.existsSync(song.filePath)) {
      song.streamUrl = song.publicUrl || `/uploads/${roomId}/${song.id}.mp3`;
      processSong();
    } else if (song.url && song.url.includes('drive.google.com')) {
          // Download from Google Drive
          fileHandler.downloadFromGDrive(song.url, roomId, song.id)
            .then(({ filePath, publicUrl }) => {
              song.filePath = filePath;
              song.publicUrl = publicUrl;
              song.streamUrl = publicUrl;
              processSong();
            })
            .catch(err => {
              console.error(`Failed to download GDrive file: ${err.message}`);
              io.to(roomId).emit('chat:system', `Failed to load "${song.title}" from Google Drive`);
              playNext(roomId);
            });
        } else if (song.source === 'youtube' && song.videoId) {
          // Try server-side audio extraction so mobile clients can use
          // <audio> element (supports background playback). Falls back to
          // the client-side YouTube IFrame Player API on failure.
          fileHandler.getYouTubeStreamUrl(song.videoId)
            .then(() => {
              song.streamUrl = '/api/youtube-audio/' + song.videoId;
              song.isYouTubeStream = true;
              processSong();
            })
            .catch(() => {
              // Fall back to client-side iframe if extraction fails
              // (bot check, expired token, etc.)
              processSong();
            });
        } else if (song.source === 'youtube' && song.url) {
                      // Legacy fallback: no videoId on the item - try the server path
                      fileHandler.downloadFromYoutube(song.url, roomId, song.id)
                    .then((result) => {
                      song.filePath = result.filePath;
                      song.publicUrl = result.publicUrl;
                      song.streamUrl = result.publicUrl;
                      song.isYouTubeStream = true;
                      processSong();
                    })
                    .catch(err => {
                      console.error(`Failed to load YouTube audio: ${err.message}`);
                      io.to(roomId).emit('chat:system', `Failed to load "${song.title}" from YouTube`);
                      playNext(roomId);
                    });
    } else if (song.filePath) {
      song.streamUrl = song.publicUrl || `/uploads/${roomId}/${song.id}.mp3`;
      // Try to use it directly
      processSong();
    } else {
      io.to(roomId).emit('chat:system', `Cannot play "${song.title}" - source unavailable`);
      playNext(roomId);
    }
  }

  function preFetchSong(roomId, song) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

        // If already cached, skip
    if (song.filePath && fs.existsSync(song.filePath)) return;

    // IFrame-playable YouTube songs need no server-side prefetch at all -
    // clients load the video themselves via the YouTube IFrame Player API.
    if (song.source === 'youtube' && song.videoId) return;

    if (song.url && song.url.includes('drive.google.com')) {
          fileHandler.downloadFromGDrive(song.url, roomId, song.id)
            .then(({ filePath, publicUrl }) => {
              song.filePath = filePath;
              song.publicUrl = publicUrl;
              song.streamUrl = publicUrl;
              console.log(`[~] Pre-fetched: ${song.title}`);
              // Notify clients the song is now ready
              io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));
            })
            .catch(err => {
              console.error(`Pre-fetch failed for ${song.title}: ${err.message}`);
            });
        } else if (song.source === 'youtube' && song.url) {
                  fileHandler.downloadFromYoutube(song.url, roomId, song.id)
                    .then((result) => {
                      song.filePath = result.filePath;
                      song.publicUrl = result.publicUrl;
                      song.streamUrl = result.publicUrl;
                      song.isYouTubeStream = true;
                      console.log(`[~] Pre-fetched YouTube: ${song.title}`);
                      io.to(roomId).emit('queue:updated', roomManager.getQueue(roomId));
                    })
                    .catch(err => {
                      console.error(`Pre-fetch failed for ${song.title}: ${err.message}`);
                    });
        }
  }

  // ---- ERROR HANDLING ----
  socket.on('error', (err) => {
    console.error(`Socket error (${socket.id}):`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`🎵 Wojo Music Server running on port ${PORT}`);

  // Warm up the YouTube session in the background (non-blocking) so the
  // first user request is fast and the PoToken pipeline is initialised.
  import('./youtube.mjs')
    .then((m) => m.warmUp())
    .then((ok) => console.log(`[~] YouTube engine warm-up: ${ok ? 'ready' : 'deferred'}`))
    .catch((err) => console.warn('[~] YouTube warm-up failed:', err.message));
});