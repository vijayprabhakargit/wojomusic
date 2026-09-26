import React, { useState } from 'react';

export default function QueuePanel({
  queue = [],
  currentIndex = -1,
  myInfo,
  onRemove,
  onReorder,
  canControl,
  formatTime
}) {
  const [dragIndex, setDragIndex] = useState(null);

  const handleDragStart = (e, index) => {
    if (!canControl) return;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    if (!canControl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (!canControl || dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    onReorder(dragIndex, targetIndex);
    setDragIndex(null);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(192,160,96,0.2)',
      }}>
        <span style={{
          fontSize: '14px',
          color: 'var(--accent)',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          📋 Queue
          <span style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            background: 'rgba(192,160,96,0.1)',
            padding: '1px 6px',
            borderRadius: '10px',
          }}>
            {queue.length}/20
          </span>
        </span>
        {canControl && queue.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            drag to reorder
          </span>
        )}
      </div>

      {/* Queue List */}
      <div style={{
        flex: 1,
                overflowY: 'auto',
                padding: '8px',
                minHeight: 0,
      }}>
        {queue.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '120px',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📼</div>
            <div style={{ fontSize: '13px' }}>Queue is empty</div>
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
              Click "Add Song" to add music
            </div>
          </div>
        ) : (
          queue.map((song, index) => {
            const isPlaying = index === currentIndex;
            const isReady = song.isReady || song.filePath;
            const isDownloading = song.isDownloading;
            const isFailed = song.downloadFailed;

            return (
              <div
                key={song.id}
                draggable={canControl && !isPlaying}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  marginBottom: '4px',
                  borderRadius: '6px',
                  background: isPlaying
                    ? 'rgba(192,160,96,0.15)'
                    : dragIndex === index
                      ? 'rgba(192,160,96,0.3)'
                      : 'rgba(255,255,255,0.03)',
                  border: isPlaying ? '1px solid var(--accent)' : '1px solid transparent',
                  cursor: canControl && !isPlaying ? 'grab' : 'default',
                  transition: 'all 0.2s',
                }}
              >
                {/* Number & playing indicator */}
                <div style={{
                  minWidth: '24px',
                  textAlign: 'center',
                  color: isPlaying ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                }}>
                  {isPlaying ? '▶' : index + 1}
                </div>

                {/* Song info */}
                <div style={{
                  flex: 1,
                  minWidth: 0,
                }}>
                  <div style={{
                    fontSize: '13px',
                    color: isPlaying ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: isPlaying ? 'bold' : 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {song.title}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span>{song.addedBy}</span>
                    <span>·</span>
                    <span style={{ textTransform: 'uppercase', fontSize: '9px' }}>
                      {song.source === 'gdrive' ? '☁ Drive' : '📂 Local'}
                    </span>
                  </div>
                </div>

                {/* Status icon */}
                <div style={{ fontSize: '13px' }}>
                  {isPlaying && (
                    <span style={{ color: 'var(--success)', fontSize: '10px' }}>
                      {song.duration ? formatTime(song.duration) : 'LIVE'}
                    </span>
                  )}
                  {isDownloading && (
                    <span title="Downloading..." style={{ fontSize: '14px' }}>⏬</span>
                  )}
                  {isFailed && (
                    <span title="Failed to download" style={{ color: 'var(--danger)', fontSize: '14px' }}>⚠</span>
                  )}
                </div>

                {/* Remove button */}
                {canControl && !isPlaying && (
                  <button
                    className="walkman-btn danger"
                    onClick={() => onRemove(song.id)}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    title="Remove from queue"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}