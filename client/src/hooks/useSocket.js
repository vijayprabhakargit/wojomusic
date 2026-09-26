import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function useSocket(roomId = null) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [playerState, setPlayerState] = useState(null);
  const [queue, setQueue] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [myInfo, setMyInfo] = useState(null);
  const [roomIdState, setRoomIdState] = useState(roomId);
  const listenersRef = useRef(new Map());

  // Initialize socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      setIsConnected(false);
    });

    // Room joined event
    socket.on('room:joined', (data) => {
      setRoomIdState(data.roomId);
      setMyInfo(data.participant);
      setParticipants(data.participants);
      setQueue(data.queue);
      setPlayerState(data.playerState);
      setChatMessages([]);
    });

    socket.on('participants:update', (data) => {
      setParticipants(data);
    });

    socket.on('queue:updated', (data) => {
      setQueue(data);
    });

    socket.on('player:state', (data) => {
      setPlayerState(data);
    });

    socket.on('player:ended', () => {
      setPlayerState(prev => ({ ...prev, currentSong: null, isPlaying: false }));
    });

    socket.on('chat:message', (data) => {
      setChatMessages(prev => [...prev, data]);
    });

    socket.on('chat:system', (message) => {
      const systemMsg = {
        id: Date.now().toString(36),
        sender: '🎵 System',
        message,
        timestamp: Date.now(),
        isSystem: true
      };
      setChatMessages(prev => [...prev, systemMsg]);
    });

    socket.on('role:promoted', ({ role }) => {
      setMyInfo(prev => ({ ...prev, role }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Room actions
  const createRoom = useCallback((name, role) => {
    return new Promise((resolve) => {
      socketRef.current.emit('room:create', { name, role }, resolve);
    });
  }, []);

  const joinRoom = useCallback((roomId, name, role) => {
    return new Promise((resolve) => {
      socketRef.current.emit('room:join', { roomId: roomId.toUpperCase(), name, role }, resolve);
    });
  }, []);

  const leaveRoom = useCallback(() => {
    if (roomIdState) {
      socketRef.current.emit('room:leave', { roomId: roomIdState });
      setRoomIdState(null);
      setMyInfo(null);
      setParticipants([]);
      setQueue([]);
      setPlayerState(null);
      setChatMessages([]);
    }
  }, [roomIdState]);

  // Queue actions
  const addToQueue = useCallback((song) => {
    return new Promise((resolve) => {
      socketRef.current.emit('queue:add', { roomId: roomIdState, song }, resolve);
    });
  }, [roomIdState]);

  const removeFromQueue = useCallback((songId) => {
      return new Promise((resolve) => {
        socketRef.current.emit('queue:remove', { roomId: roomIdState, songId }, resolve);
      });
    }, [roomIdState]);

    const reorderQueue = useCallback((fromIndex, toIndex) => {
      return new Promise((resolve) => {
        socketRef.current.emit('queue:reorder', { roomId: roomIdState, fromIndex, toIndex }, resolve);
      });
    }, [roomIdState]);

  // Player controls
  const play = useCallback(() => {
    socketRef.current.emit('player:play', { roomId: roomIdState });
  }, [roomIdState]);

  const pause = useCallback(() => {
    socketRef.current.emit('player:pause', { roomId: roomIdState });
  }, [roomIdState]);

  const seek = useCallback((position) => {
    socketRef.current.emit('player:seek', { roomId: roomIdState, position });
  }, [roomIdState]);

  const nextTrack = useCallback(() => {
    socketRef.current.emit('player:next', { roomId: roomIdState });
  }, [roomIdState]);

  const prevTrack = useCallback(() => {
      socketRef.current.emit('player:previous', { roomId: roomIdState });
    }, [roomIdState]);

    const playFromQueue = useCallback((index) => {
      return new Promise((resolve) => {
        socketRef.current.emit('player:playSpecific', { roomId: roomIdState, index }, resolve);
      });
    }, [roomIdState]);

  const reportProgress = useCallback((position) => {
    socketRef.current.emit('player:progress', { roomId: roomIdState, position });
  }, [roomIdState]);

  const syncPosition = useCallback((position, clientTimestamp) => {
    socketRef.current.emit('player:sync', { 
      roomId: roomIdState, 
      clientPosition: position,
      clientTimestamp 
    });
  }, [roomIdState]);

  // Chat
  const sendMessage = useCallback((message) => {
    if (message.trim()) {
      socketRef.current.emit('chat:message', { roomId: roomIdState, message: message.trim() });
    }
  }, [roomIdState]);

  // File upload
    const uploadFile = useCallback((fileBuffer, fileName, fileType) => {
      return new Promise((resolve) => {
        socketRef.current.emit('file:upload', { 
          roomId: roomIdState, 
          fileBuffer, 
          fileName, 
          fileType 
        }, resolve);
      });
    }, [roomIdState]);

    // YouTube
    const addYoutube = useCallback((url) => {
      return new Promise((resolve) => {
        socketRef.current.emit('youtube:add', { roomId: roomIdState, url }, resolve);
      });
    }, [roomIdState]);

    return {
    isConnected,
    socket: socketRef.current,
    roomId: roomIdState,
    myInfo,
    playerState,
    queue,
    participants,
    chatMessages,
    createRoom,
    joinRoom,
    leaveRoom,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    play,
    pause,
    seek,
    nextTrack,
    prevTrack,
        playFromQueue,
        reportProgress,
        syncPosition,
        sendMessage,
                uploadFile,
                addYoutube
              };
}