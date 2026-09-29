const { v4: uuidv4 } = require('uuid');

const MAX_QUEUE_SIZE = 20;

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { id, participants, queue, playerState, createdAt }
  }

  createRoom() {
    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      participants: [],
      queue: [],
      playerState: {
        currentSong: null,
        currentIndex: -1,
        isPlaying: false,
        position: 0,
        lastUpdated: Date.now()
      },
      createdAt: Date.now()
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  addParticipant(roomId, socketId, { name, role = 'listener' }) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    // Validate role
    const validRoles = ['admin', 'moderator', 'listener'];
    if (!validRoles.includes(role)) role = 'listener';

    // If room is empty, first person is admin
    if (room.participants.length === 0) role = 'admin';

    const participant = {
      id: socketId,
      name: name.slice(0, 30), // Limit name length
      role,
      joinedAt: Date.now()
    };

    // Check for duplicate names - add suffix if needed
    const existingNames = room.participants.map(p => p.name);
    if (existingNames.includes(name)) {
      let counter = 1;
      while (existingNames.includes(`${name} (${counter})`)) counter++;
      participant.name = `${name} (${counter})`;
    }

    room.participants.push(participant);
    return participant;
  }

  removeParticipant(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const index = room.participants.findIndex(p => p.id === socketId);
    if (index === -1) return false;

    room.participants.splice(index, 1);
    return true;
  }

  getParticipantBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      const participant = room.participants.find(p => p.id === socketId);
      if (participant) return participant;
    }
    return null;
  }

  updateParticipantRole(roomId, socketId, newRole) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const participant = room.participants.find(p => p.id === socketId);
    if (!participant) return false;

    participant.role = newRole;
    return true;
  }

  getParticipants(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.participants : [];
  }

  addToQueue(roomId, song) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const queueItem = {
          id: uuidv4(),
          title: song.title || song.fileName || 'Unknown Track',
          fileName: song.fileName || '',
          url: song.url || '',
          filePath: song.filePath || null,
          fileType: song.fileType || 'audio/mpeg',
          duration: song.duration || 0,
          addedBy: song.addedBy || 'Unknown',
          addedById: song.addedById || '',
          addedAt: Date.now(),
          source: song.source || 'local', // 'local' | 'gdrive' | 'youtube'
          videoId: song.videoId || null, // YouTube: lets clients play via the IFrame Player API
          lastPlayedAt: null // tracks recency for LRU eviction
        };

    room.queue.push(queueItem);
    return queueItem;
  }

  removeFromQueue(roomId, songId) {
      const room = this.rooms.get(roomId);
      if (!room) return false;

      const index = room.queue.findIndex(s => s.id === songId);
      if (index === -1) return false;

      room.queue.splice(index, 1);

      // Adjust current index if needed
      if (room.playerState.currentIndex >= index) {
        room.playerState.currentIndex = Math.max(-1, room.playerState.currentIndex - 1);
      }

      return true;
    }

    markSongPlayed(roomId, songId) {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const song = room.queue.find(s => s.id === songId);
      if (song) {
        song.lastPlayedAt = Date.now();
      }
    }

    evictLRU(roomId) {
      const room = this.rooms.get(roomId);
      if (!room) return null;

      // Count only disk-based songs (local uploads + Google Drive downloads)
      const diskSongs = room.queue.filter(s => s.source === 'local' || s.source === 'gdrive');
      // YouTube songs are streamed (no disk usage), so they're excluded from the LRU limit

      // Only evict if disk-based songs exceed max size
      if (diskSongs.length <= MAX_QUEUE_SIZE) return null;

      // Find the LRU disk-based song - exclude the currently playing song
      const currentSongId = room.playerState.currentSong?.id;
      const eligible = diskSongs.filter(s => s.id !== currentSongId);

      if (eligible.length === 0) return null;

      // Sort by lastPlayedAt (nulls first = never played), then by addedAt (oldest first)
      eligible.sort((a, b) => {
        // Never-played items come first (most eligible for eviction)
        if (a.lastPlayedAt === null && b.lastPlayedAt !== null) return -1;
        if (a.lastPlayedAt !== null && b.lastPlayedAt === null) return 1;
        // Both played or both never played - compare timestamps
        const aTime = a.lastPlayedAt || a.addedAt;
        const bTime = b.lastPlayedAt || b.addedAt;
        return aTime - bTime;
      });

      const lru = eligible[0];
      this.removeFromQueue(roomId, lru.id);
      return lru;
    }

    /** Get count of disk-based songs (local + gdrive) in the queue */
    getDiskSongCount(roomId) {
      const room = this.rooms.get(roomId);
      if (!room) return 0;
      return room.queue.filter(s => s.source === 'local' || s.source === 'gdrive').length;
    }

    /** Get count of YouTube stream songs in the queue */
    getYoutubeSongCount(roomId) {
      const room = this.rooms.get(roomId);
      if (!room) return 0;
      return room.queue.filter(s => s.source === 'youtube').length;
    }

  reorderQueue(roomId, fromIndex, toIndex) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (fromIndex < 0 || fromIndex >= room.queue.length) return false;
    if (toIndex < 0 || toIndex >= room.queue.length) return false;
    if (fromIndex === toIndex) return true;

    const [moved] = room.queue.splice(fromIndex, 1);
    room.queue.splice(toIndex, 0, moved);

    // Adjust current index
    if (room.playerState.currentIndex === fromIndex) {
      room.playerState.currentIndex = toIndex;
    } else if (fromIndex < room.playerState.currentIndex && toIndex >= room.playerState.currentIndex) {
      room.playerState.currentIndex--;
    } else if (fromIndex > room.playerState.currentIndex && toIndex <= room.playerState.currentIndex) {
      room.playerState.currentIndex++;
    }

    return true;
  }

  getQueue(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.queue : [];
  }

  setPlayerState(roomId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.playerState = { ...room.playerState, ...updates };
  }

  getPlayerState(roomId) {
    const room = this.rooms.get(roomId);
    return room ? { ...room.playerState } : null;
  }

  generateRoomId() {
    // Generate a short, readable room ID (6 chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar-looking chars
    let id;
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(id));
    return id;
  }
}

module.exports = RoomManager;