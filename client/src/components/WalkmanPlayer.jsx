import React from 'react';

export default function WalkmanPlayer({
  _playerState,
  currentSong,
  isPlaying,
  canControl,
  localPosition,
  duration,
  progressPercent,
  formatTime,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onSeek,
  onAddSource,
  myInfo,
    videoSlot,   // always-mounted node (e.g. YtIframePlayer) - audio keeps playing even when collapsed
    showVideo,   // false -> collapsed to 1px inside the deck; true -> deck expands with a video screen
    onToggleVideo, // shown next to Add Song when a YouTube video screen is available
    compact      // true -> hide tape reels & visualizer (used on mobile when video is shown)
  }) {
  return (
    <div className="cassette-frame" style={{
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Cassette Deck Visual */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}>
              {/* Video Screen - expands the deck when shown, collapses to 1px
                  (inside this overflow:hidden frame) when hidden so the iframe
                  stays mounted and audio never stops */}
              {videoSlot && (
                <div style={{
                  width: '100%',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#000',
                  transition: 'opacity 0.25s ease',
                  ...(showVideo ? {
                    position: 'relative',
                    aspectRatio: '16 / 9',
                    opacity: 1,
                    pointerEvents: 'auto',
                    border: '1px solid rgba(192,160,96,0.35)',
                  } : {
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    bottom: 0,
                    left: 0,
                    opacity: 0.01,
                    pointerEvents: 'none',
                  }),
                }}>
                  {videoSlot}
                </div>
              )}

              {/* Tape Reels (hidden in compact mode to save screen for video) */}
              {!compact && (<>
              <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '40px',
          padding: '20px 0',
          width: '100%',
          position: 'relative',
        }}>
          {/* Left Reel */}
          <div className={`reel ${isPlaying ? 'spinning' : ''}`} style={{ animationDirection: 'reverse' }}>
            <div className="reel-inner" />
          </div>

          {/* Cassette Window / Now Playing */}
          <div style={{
            flex: 1,
            maxWidth: '200px',
            textAlign: 'center',
            padding: '0 10px',
          }}>
            <div style={{
              background: 'var(--cassette-display)',
              borderRadius: '4px',
              padding: '10px',
              border: '1px solid #444',
              minHeight: '60px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              {currentSong ? (
                <>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}>
                    Now Playing
                  </div>
                  <div style={{
                    fontSize: '15px',
                    color: 'var(--accent)',
                    fontWeight: 'bold',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '180px',
                  }}
                    title={currentSong.title}
                  >
                    {currentSong.title}
                  </div>
                  {currentSong.addedBy && (
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      marginTop: '2px',
                    }}>
                      added by {currentSong.addedBy}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No song playing
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                    Add songs to the queue!
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Reel */}
          <div className={`reel ${isPlaying ? 'spinning' : ''}`}>
            <div className="reel-inner" />
          </div>
        </div>

        {/* Visualizer (active when playing) */}
        {isPlaying && (
          <div className="visualizer">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="visualizer-bar" />
            ))}
          </div>
        )}
        </>)}

        {/* Progress Bar */}
        <div
          className="progress-bar"
          onClick={canControl ? onSeek : undefined}
          style={{ cursor: canControl ? 'pointer' : 'default', width: '100%' }}
        >
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>

        {/* Time Display */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <span>{formatTime(localPosition)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Transport Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          width: '100%',
        }}>
          {/* Previous */}
          <button
            className="walkman-btn"
            onClick={onPrev}
            disabled={!canControl || !currentSong}
            style={{ fontSize: '18px', padding: '8px 12px' }}
            title="Previous"
          >
            ⏮
          </button>

          {/* Play/Pause */}
          <button
            className={`walkman-btn ${!isPlaying ? 'primary' : ''}`}
            onClick={isPlaying ? onPause : onPlay}
            disabled={!canControl}
            style={{
              fontSize: '24px',
              padding: '12px 24px',
              borderRadius: '8px',
              minWidth: '80px',
            }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶️'}
          </button>

          {/* Next */}
          <button
            className="walkman-btn"
            onClick={onNext}
            disabled={!canControl || !currentSong}
            style={{ fontSize: '18px', padding: '8px 12px' }}
            title="Next"
          >
            ⏭
          </button>
        </div>

        {/* Status & Add Song */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          borderTop: '1px solid rgba(192,160,96,0.2)',
          paddingTop: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isPlaying ? 'var(--success)' : '#666',
            }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {isPlaying ? 'Playing' : currentSong ? 'Paused' : 'Ready'}
            </span>
            {myInfo && (
              <span className={`role-badge ${myInfo.role}`} style={{ marginLeft: '8px' }}>
                {myInfo.role}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {onToggleVideo && (
                        <button
                          className="walkman-btn"
                          onClick={onToggleVideo}
                          style={{ padding: '6px 12px', fontSize: '13px' }}
                          title={showVideo ? 'Hide the video screen' : 'Show the video screen (audio keeps playing)'}
                        >
                          {showVideo ? '🎬 Hide Video' : '🎬 Show Video'}
                        </button>
                      )}
                      <button
                        className="walkman-btn"
                        onClick={onAddSource}
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                      >
                        📀 Add Song
                      </button>
                    </div>
        </div>
      </div>
    </div>
  );
}