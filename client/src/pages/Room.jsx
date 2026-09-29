import React, { useState, useRef, useEffect, useCallback } from 'react';
import WalkmanPlayer from '../components/WalkmanPlayer';
import YtIframePlayer from '../components/YtIframePlayer';
import SourceSelector from '../components/SourceSelector';
import QueuePanel from '../components/QueuePanel';
import Chat from '../components/Chat';
import Participants from '../components/Participants';

// Extract an 11-char video id from any common YouTube URL shape
const extractYtId = (url) => {
  if (!url) return null;
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

// YouTube songs with a resolvable videoId are played via the IFrame Player
// API instead of the <audio> element (no server download / bot-check).
const resolveYtVideoId = (song) => {
  if (!song || song.source !== 'youtube') return null;
  return song.videoId || extractYtId(song.url);
};

export default function Room({ socket, onLeave }) {
  const [activePanel, setActivePanel] = useState('queue'); // 'queue' | 'chat' | 'participants'
  const [showSourceModal, setShowSourceModal] = useState(false);

  // ---- YouTube IFrame engine state ----
  const ytRef = useRef(null); // imperative handle: play/pause/seek/getPosition/getDuration
  const [ytReady, setYtReady] = useState(false);       // YT.Player created & usable
  const [ytState, setYtState] = useState(-1);          // -1 unstarted, 1 playing, 2 paused, 3 buffering, 0 ended
  const [ytError, setYtError] = useState(null);        // iframe player error code (101/150 = embed-restricted)
  const [showVideo, setShowVideo] = useState(false);   // per-user video on/off (audio never stops)
  const [needsTapToJoin, setNeedsTapToJoin] = useState(false); // autoplay blocked -> user must gesture

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

    // Active playback engine: 'yt' (IFrame API) or 'audio' (local/gdrive/legacy)
  const ytVideoId = resolveYtVideoId(currentSong);
  const isYtMode = Boolean(ytVideoId);

  // Capture the start position exactly when the YT song changes (render-time,
  // so <YtIframePlayer> loads once with the right startSeconds instead of
  // reloading when later position updates arrive).
  const ytStartAtRef = useRef(0);
  const prevYtIdRef = useRef(null);
  if (ytVideoId !== prevYtIdRef.current) {
    prevYtIdRef.current = ytVideoId;
    ytStartAtRef.current = playerState?.position || 0;
  }
  const ytStartAt = ytStartAtRef.current;

  // Reset per-video YT flags when the song changes
  useEffect(() => {
    setYtError(null);
    setYtState(-1);
    setNeedsTapToJoin(false);
  }, [ytVideoId]);

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
    if (!playerState) return;

    const { isPlaying, position, currentSong: serverSong } = playerState;

    if (!serverSong) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setAudioReady(false);
      return;
    }

    const ytId = resolveYtVideoId(serverSong);

    if (ytId) {
      // ---- YOUTUBE IFRAME ENGINE ----
      // Loading happens via the videoId/startAt props on <YtIframePlayer>.
      // play/pause only after the player is ready; drift-correct above 2s.
      if (ytReady && ytRef.current) {
        if (isPlaying) {
          ytRef.current.play();
        } else {
          ytRef.current.pause();
        }
        const t = ytRef.current.getPosition();
        if (t > 0 && Math.abs(t - (position || 0)) > 2) {
          ytRef.current.seek(position || 0);
        }
      }
      return;
    }

    // ---- <audio> ENGINE (local / gdrive / legacy youtube) ----
    if (!audioRef.current) return;
    const audio = audioRef.current;

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
  }, [playerState?.currentSong?.id, playerState?.isPlaying, ytReady, ytVideoId, showVideo]);

    // Sync position when paused
  useEffect(() => {
    if (!playerState) return;
    if (playerState.isPlaying || playerState.position === undefined) return;

    if (isYtMode && ytReady && ytRef.current) {
      const t = ytRef.current.getPosition();
      if (Math.abs(t - playerState.position) > 1) {
        ytRef.current.seek(playerState.position);
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = playerState.position;
    }
  }, [playerState?.position, playerState?.isPlaying, isYtMode, ytReady, ytVideoId]);

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
      if (isYtMode) {
        // 1 = playing, 3 = buffering (still reports time)
        const s = ytRef.current?.getPlayerState?.();
        if (s === 1 || s === 3) {
          const t = ytRef.current.getPosition();
          socket.reportProgress(t);
          setLocalPosition(t);
        }
      } else if (audioRef.current && !audioRef.current.paused) {
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
  }, [canControl, playerState?.isPlaying, playerState?.currentSong?.id, isYtMode]);

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
      if (isYtMode) {
        const s = ytRef.current?.getPlayerState?.();
        if (s === 1 || s === 3) {
          socket.syncPosition(ytRef.current.getPosition(), Date.now());
        }
      } else if (audioRef.current && !audioRef.current.paused) {
        socket.syncPosition(audioRef.current.currentTime, Date.now());
      }
    }, 5000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [playerState?.isPlaying, canControl, playerState?.currentSong?.id, isYtMode]);

    // Update local position display
  useEffect(() => {
    if (!playerState?.isPlaying) return;

    const interval = setInterval(() => {
      if (isYtMode) {
        const s = ytRef.current?.getPlayerState?.();
        if (s === 1 || s === 3) {
          setLocalPosition(ytRef.current.getPosition());
        }
      } else if (audioRef.current && !audioRef.current.paused) {
        setLocalPosition(audioRef.current.currentTime);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [playerState?.isPlaying, playerState?.currentSong?.id, isYtMode]);

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
    if (!canControl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * getDuration();
    if (isYtMode && ytRef.current) {
      ytRef.current.seek(newTime);
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
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
    if (isYtMode && ytRef.current) {
      const d = ytRef.current.getDuration();
      return d && !isNaN(d) ? d : 0;
    }
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
          height: isMobile ? '100dvh' : '100vh',
          overflow: 'hidden',
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

      {/* YouTube IFrame engine - plays audio always; video visible only
          when the user turns it on (see 13.5). Sits behind the artwork. */}
      {ytVideoId && (
        <YtIframePlayer
          ref={ytRef}
          videoId={ytVideoId}
          startAt={ytStartAt}
                    showVideo={showVideo && !ytError}
          onReady={() => setYtReady(true)}
          onStateChange={(s) => setYtState(s)}
          onEnded={() => {
            if (canControl) socket.nextTrack();
          }}
          onError={(code) => setYtError(code)}
          onToggleVideo={() => setShowVideo(v => !v)}
        />
      )}

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
                  flex: isMobile ? '0 0 auto' : '1 1 60%',
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

          {/* YouTube video toggle - video only; audio never stops */}
          {isYtMode && !ytError && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                className="walkman-btn"
                onClick={() => setShowVideo(v => !v)}
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                {showVideo ? '🎬 Hide video' : '🎬 Show video'}
              </button>
            </div>
          )}

          {/* YouTube status banners: loading / tap-to-join / embed-restricted */}
          {isYtMode && ytError !== null && (
            <div className="glass-panel" style={{
              padding: '10px 14px', fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '10px',
              flexWrap: 'wrap',
              color: 'var(--text-secondary)',
            }}>
              <span>
                ⚠ YouTube won't let this video play inside other websites
                (error {ytError}).
              </span>
              <a
                href={`https://www.youtube.com/watch?v=${ytVideoId}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                Watch on YouTube ↗
              </a>
            </div>
          )}
          {isYtMode && !ytError && playerState?.isPlaying && (
            !ytReady ? (
              <div className="glass-panel" style={{ padding: '8px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                ⏳ Loading YouTube player…
              </div>
            ) : (ytState === -1 || ytState === 5) && (
              <button
                className="walkman-btn primary"
                onClick={() => {
                  setNeedsTapToJoin(false);
                  ytRef.current?.play?.();
                }}
                style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 'bold' }}
              >
                ▶ Tap to join playback
              </button>
            )
          )}

          {/* Source Selector (shown when active) */}
          {showSourceModal && (
            <SourceSelector
              socket={socket}
              onClose={() => setShowSourceModal(false)}
              queue={queue}
            />
          )}

          {/* Mobile Panel Switcher */}
                    {isMobile && (
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
                    )}
                  </div>

                  {/* Right Column - Panels (Desktop) */}
                        <div style={{
                  flex: isMobile ? 1 : '1 1 40%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  minWidth: isMobile ? 0 : '300px',
                  minHeight: 0,
                }}>
                  {/* Queue Panel */}
                  <div className="glass-panel" style={{
                    flex: isMobile ? 1 : '1 1 50%',
                    display: isMobile ? (activePanel === 'queue' ? 'flex' : 'none') : 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                                overflow: 'hidden',
                              }}>
                        <QueuePanel
                                      queue={queue}
                                      currentIndex={playerState?.currentIndex}
                                      myInfo={myInfo}
                                      onRemove={(songId) => socket.removeFromQueue(songId)}
                                      onReorder={(from, to) => socket.reorderQueue(from, to)}
                                      onPlayFromQueue={(index) => socket.playFromQueue(index)}
                                      canControl={canControl}
                                      formatTime={formatTime}
                                    />
          </div>

          {/* Chat + Participants */}
                    <div className="glass-panel" style={{
                      flex: isMobile ? 1 : '1 1 50%',
                      display: isMobile ? (activePanel === 'chat' || activePanel === 'participants' ? 'flex' : 'none') : 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
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