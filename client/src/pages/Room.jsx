import React, { useState, useRef, useEffect, useCallback } from 'react';
import WalkmanPlayer from '../components/WalkmanPlayer';
import SourceSelector from '../components/SourceSelector';
import QueuePanel from '../components/QueuePanel';
import Chat from '../components/Chat';
import Participants from '../components/Participants';

export default function Room({ socket, onLeave }) {
  const [activePanel, setActivePanel] = useState('queue'); // 'queue' | 'chat' | 'participants'
  const [showSourceModal, setShowSourceModal] = useState(false);
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const syncIntervalRef = useRef(null);
    const [localPosition, setLocalPosition] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  // Track viewport size reactively so layout responds to resizes
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { playerState, queue, participants, myInfo, roomId, isConnected } = socket;
  const currentSong = playerState?.currentSong;

  // Determine if I can control playback
  const canControl = myInfo && (myInfo.role === 'admin' || myInfo.role === 'moderator');

  // Copy room ID to clipboard
  const copyRoomId = () => {
    const shareUrl = `${window.location.origin}?join=${roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ---- AUDIO SYNC LOGIC ----

  // When player state changes from server, react accordingly
  useEffect(() => {
    if (!audioRef.current || !playerState) return;

    const audio = audioRef.current;
    const { isPlaying, position, currentSong: serverSong } = playerState;

    if (!serverSong) {
      audio.pause();
      audio.src = '';
      setAudioReady(false);
      return;
    }

    // Build the audio source URL
    const songUrl = getSongUrl(serverSong);
    if (!songUrl) return;

    const currentSrc = audio.currentSrc || '';
    if (!currentSrc.includes(songUrl)) {
      // New song
      audio.src = songUrl;
      audio.currentTime = position || 0;
      audio.load();
      setAudioReady(false);
    }

    if (isPlaying && audio.paused) {
      audio.play().catch(err => console.error('Play error:', err));
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }

    // Sync position if drift is too large
    if (position !== undefined && !audio.paused) {
      const drift = Math.abs(audio.currentTime - position);
      if (drift > 2) {
        audio.currentTime = position;
      }
    }
  }, [playerState?.currentSong?.id, playerState?.isPlaying]);

  // Sync position when paused
  useEffect(() => {
    if (!audioRef.current || !playerState) return;
    if (!playerState.isPlaying && playerState.position !== undefined) {
      audioRef.current.currentTime = playerState.position;
    }
  }, [playerState?.position, playerState?.isPlaying]);

  // Report progress periodically (only if I'm a controller)
  useEffect(() => {
    if (!canControl || !playerState?.isPlaying) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    progressIntervalRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        socket.reportProgress(audioRef.current.currentTime);
        setLocalPosition(audioRef.current.currentTime);
      }
    }, 1000);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [canControl, playerState?.isPlaying, playerState?.currentSong?.id]);

  // Regular sync check for non-controllers
  useEffect(() => {
    if (!playerState?.isPlaying || canControl) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    syncIntervalRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        socket.syncPosition(audioRef.current.currentTime, Date.now());
      }
    }, 5000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [playerState?.isPlaying, canControl, playerState?.currentSong?.id]);

  // Update local position display
  useEffect(() => {
    if (!audioRef.current || !playerState?.isPlaying) return;
    
    const interval = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        setLocalPosition(audioRef.current.currentTime);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [playerState?.isPlaying, playerState?.currentSong?.id]);

  // Listen for seek/position changes
  useEffect(() => {
    if (!audioRef.current || !playerState) return;
    if (!playerState.isPlaying && playerState.position !== undefined) {
      setLocalPosition(playerState.position);
    }
  }, [playerState?.position]);

  const getSongUrl = (song) => {
    if (!song) return null;
    // Prefer the server-served stream URL (public URL after download/during playback)
    if (song.streamUrl) {
      if (song.streamUrl.startsWith('http')) return song.streamUrl;
      // Server-relative path - prepend origin
      return `${window.location.origin}${song.streamUrl}`;
    }
    if (song.url) {
      // blob URLs from local device
      if (song.url.startsWith('blob:')) return song.url;
      // Full HTTP URLs (gdrive direct links, etc.)
      if (song.url.startsWith('http')) return song.url;
      // Server-relative /uploads/ paths
      if (song.url.startsWith('/uploads/')) return `${window.location.origin}${song.url}`;
    }
    return null;
  };

  const handleSeek = (e) => {
    if (!canControl || !audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * (audioRef.current.duration || 0);
    audioRef.current.currentTime = newTime;
    setLocalPosition(newTime);
    socket.seek(newTime);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDuration = () => {
    if (!audioRef.current || !audioRef.current.duration || isNaN(audioRef.current.duration)) return 0;
    return audioRef.current.duration;
  };

  const getProgressPercent = () => {
    const duration = getDuration();
    if (!duration) return 0;
    return (localPosition / duration) * 100;
  };

    return (
    <div style={{
      minHeight: '100vh',
      height: isMobile ? 'auto' : '100vh',
      overflow: isMobile ? 'visible' : 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '10px',
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={() => setAudioReady(true)}
        onEnded={() => {
          if (canControl) socket.nextTrack();
        }}
        onError={(e) => console.error('Audio error:', e.target.error)}
        style={{ display: 'none' }}
      />

      {/* Top Bar */}
      <div className="glass-panel" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        marginBottom: '10px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/favicon.svg" alt="Wojo" style={{ width: '28px', height: '28px' }} />
                    <span style={{ color: 'var(--accent)', fontSize: '16px', fontWeight: 'bold' }}>
                      Wojo Music
                    </span>
          {!isConnected && (
            <span style={{ color: 'var(--danger)', fontSize: '12px' }}>
              ⚠ Disconnected
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Room:</span>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '16px', letterSpacing: '2px' }}>
              {roomId}
            </span>
            <button
              className="walkman-btn"
              onClick={copyRoomId}
              style={{ padding: '4px 8px', fontSize: '12px' }}
              title="Copy invite link"
            >
              {copied ? '✅ Copied!' : '🔗 Share'}
            </button>
          </div>

          <button
            className="walkman-btn danger"
            onClick={onLeave}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            ✕ Leave
          </button>
        </div>
      </div>

      {/* Main Content */}
                  <div style={{
        display: 'flex',
        gap: '10px',
        flex: 1,
        minHeight: 0,
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        {/* Left Column - Player */}
        <div style={{
          flex: '1 1 60%',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          {/* Walkman Player */}
          <WalkmanPlayer
            playerState={playerState}
            currentSong={currentSong}
            isPlaying={playerState?.isPlaying}
            canControl={canControl}
            localPosition={localPosition}
            duration={getDuration()}
            progressPercent={getProgressPercent()}
            formatTime={formatTime}
            onPlay={() => socket.play()}
            onPause={() => socket.pause()}
            onNext={() => socket.nextTrack()}
            onPrev={() => socket.prevTrack()}
            onSeek={handleSeek}
            onAddSource={() => setShowSourceModal(true)}
            myInfo={myInfo}
          />

          {/* Source Selector (shown when active) */}
          {showSourceModal && (
            <SourceSelector
              socket={socket}
              onClose={() => setShowSourceModal(false)}
              queue={queue}
            />
          )}

          {/* Mobile Panel Switcher */}
          <div style={{
            display: 'flex',
            gap: '6px',
            marginTop: '4px',
          }}>
            {[
              { id: 'queue', label: '📋 Queue', count: queue?.length },
              { id: 'chat', label: '💬 Chat' },
              { id: 'participants', label: '👥 People', count: participants?.length },
            ].map((panel) => (
              <button
                key={panel.id}
                className={`walkman-btn ${activePanel === panel.id ? 'primary' : ''}`}
                style={{ flex: 1, fontSize: '12px', padding: '8px', position: 'relative' }}
                onClick={() => setActivePanel(panel.id)}
              >
                {panel.label}
                {panel.count !== undefined && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: 'var(--accent)',
                    color: '#1a1a1a',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {panel.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column - Panels (Desktop) */}
                <div style={{
          flex: '1 1 40%',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minWidth: '300px',
          minHeight: 0,
        }}>
          {/* Queue Panel */}
          <div className="glass-panel" style={{
            flex: '1 1 50%',
            display: isMobile ? (activePanel === 'queue' ? 'flex' : 'none') : 'flex',
            flexDirection: 'column',
            minHeight: isMobile ? '200px' : 0,
                        overflow: 'hidden',
                      }}>
                        <QueuePanel
              queue={queue}
              currentIndex={playerState?.currentIndex}
              myInfo={myInfo}
              onRemove={(songId) => socket.removeFromQueue(songId)}
              onReorder={(from, to) => socket.reorderQueue(from, to)}
              canControl={canControl}
              formatTime={formatTime}
            />
          </div>

          {/* Chat + Participants */}
          <div className="glass-panel" style={{
            flex: '1 1 50%',
            display: isMobile ? (activePanel === 'chat' || activePanel === 'participants' ? 'flex' : 'none') : 'flex',
            flexDirection: 'column',
            minHeight: isMobile ? '250px' : 0,
                        overflow: 'hidden',
                      }}>
                        {activePanel === 'participants' && isMobile ? (
              <Participants
                participants={participants}
                myInfo={myInfo}
                onClose={() => setActivePanel('chat')}
              />
            ) : (
              <Chat
                messages={socket.chatMessages}
                onSend={(msg) => socket.sendMessage(msg)}
                myInfo={myInfo}
                participants={participants}
                showParticipants={showParticipants}
                onToggleParticipants={() => setShowParticipants(!showParticipants)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}