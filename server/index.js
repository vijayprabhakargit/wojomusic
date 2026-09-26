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

// Serve client build in production
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/socket.io') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
  console.log('[~] Serving client build from', clientDist);
}

// Initialize managers
const roomManager = new RoomManager();
const fileHandler = new FileHandler(uploadsDir, 30 * 1024 * 1024); // 30MB max

// YouTube audio streaming proxy
app.get('/api/youtube-audio/:videoId', fileHandler.createYouTubeProxy());

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

      // Fetch video info from YouTube
      fileHandler.getYoutubeInfo(url.trim())
        .then((info) => {
          // Create a title from video title (truncate long titles)
          const title = info.title.length > 100 ? info.title.slice(0, 97) + '...' : info.title;

          const queueItem = roomManager.addToQueue(roomId, {
            title,
            url: url.trim(),
            source: 'youtube',
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
        } else if (song.source === 'youtube' && song.url) {
                  // Get YouTube streaming URL (proxied via our server)
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
});