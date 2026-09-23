import React, { useState, useRef } from 'react';

export default function SourceSelector({ socket, onClose, queue }) {
  const [tab, setTab] = useState('local'); // 'local' | 'gdrive'
  const [uploading, setUploading] = useState(false);
  const [addingGDrive, setAddingGDrive] = useState(false);
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const MAX_SIZE_MB = 30;

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setError('');
    setSuccess('');
    setUploading(true);

    // Validate each file
    for (const file of files) {
      // Check size
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max is ${MAX_SIZE_MB}MB.`);
        continue;
      }

      // Check type
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/webm', 'audio/x-m4a', 'audio/mp4'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i)) {
        setError(`"${file.name}" is not an audio file. Supported: mp3, wav, ogg, flac, aac, m4a, webm`);
        continue;
      }

      try {
        // Read file as buffer (with size check)
        const buffer = await file.arrayBuffer();
        
        // Send to server via socket
        const result = await socket.uploadFile(buffer, file.name, file.type);

        if (result.success) {
          // Add to queue
          const addResult = await socket.addToQueue({
            title: file.name.replace(/\.[^/.]+$/, '').replace(/[_]/g, ' '),
            fileName: file.name,
            url: result.file.publicUrl, // Use public URL for streaming
            fileType: file.type,
            source: 'local',
            duration: 0, // We'll update when it loads
            size: file.size
          });

          if (addResult.success) {
            setSuccess(`"${file.name}" added to queue!`);
          } else {
            setError(addResult.error || `Failed to add "${file.name}" to queue`);
          }
        } else {
          setError(result.error || `Failed to upload "${file.name}"`);
        }
      } catch (err) {
        setError(`Error uploading "${file.name}": ${err.message}`);
      }
    }

    // Reset file input
    e.target.value = '';
    setUploading(false);
  };

  const handleGDriveAdd = async () => {
    if (!gdriveUrl.trim()) {
      setError('Please paste a Google Drive share link');
      return;
    }

    setError('');
    setSuccess('');
    setAddingGDrive(true);

    try {
      // Validate it looks like a GDrive link
      const isDriveLink = /drive\.google\.com/.test(gdriveUrl);
      if (!isDriveLink) {
        setError('This does not look like a Google Drive link. Example: https://drive.google.com/file/d/FILE_ID/view');
        setAddingGDrive(false);
        return;
      }

      // Extract file ID
      let fileId = null;
      const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /[?&]id=([a-zA-Z0-9_-]+)/,
      ];
      for (const pattern of patterns) {
        const match = gdriveUrl.match(pattern);
        if (match) {
          fileId = match[1];
          break;
        }
      }

      if (!fileId) {
        setError('Could not find a file ID in that link. Make sure it\'s a file link, not a folder.');
        setAddingGDrive(false);
        return;
      }

      // Extract filename from URL if present, otherwise use file ID
      const titleGuess = gdriveUrl.split('/').pop().split('?')[0] || `Drive File ${fileId.slice(0, 6)}`;

      const result = await socket.addToQueue({
        title: titleGuess.replace(/[_%20]/g, ' '),
        url: `https://drive.google.com/uc?export=download&id=${fileId}`,
        source: 'gdrive',
        fileId,
        duration: 0,
        size: 0 // Will check on download
      });

      if (result.success) {
        setSuccess('Song added! It will download when it reaches the top of the queue.');
        setGdriveUrl('');
      } else {
        setError(result.error || 'Failed to add Google Drive song');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setAddingGDrive(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }}
      onClick={onClose}
    >
      <div
        className="cassette-frame"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '30px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h2 style={{ color: 'var(--accent)', fontSize: '20px' }}>
            📀 Add Music
          </h2>
          <button
            className="walkman-btn"
            onClick={onClose}
            style={{ padding: '4px 10px' }}
          >
            ✕
          </button>
        </div>

        {/* Queue status */}
        <div style={{
          textAlign: 'center',
          marginBottom: '15px',
          padding: '6px',
          background: 'rgba(192,160,96,0.1)',
          borderRadius: '4px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          Queue: {queue?.length || 0} songs
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
        }}>
          <button
            className={`walkman-btn ${tab === 'local' ? 'primary' : ''}`}
            style={{ flex: 1, fontSize: '13px' }}
            onClick={() => { setTab('local'); setError(''); setSuccess(''); }}
          >
            📂 From My Device
          </button>
          <button
            className={`walkman-btn ${tab === 'gdrive' ? 'primary' : ''}`}
            style={{ flex: 1, fontSize: '13px' }}
            onClick={() => { setTab('gdrive'); setError(''); setSuccess(''); }}
          >
            🌐 Google Drive
          </button>
        </div>

        {tab === 'local' ? (
          <div>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '15px',
            }}>
              Select audio files from your device to share with the room. Files are uploaded to the server and streamed to everyone.
            </p>

            {/* Drag & drop area */}
            <div
              style={{
                border: '2px dashed #555',
                borderRadius: '8px',
                padding: '30px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = '#555'; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#555';
                if (e.dataTransfer.files.length > 0) {
                  handleFileSelect({ target: { files: e.dataTransfer.files } });
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎵</div>
              <div style={{ fontSize: '14px', color: 'var(--accent)', marginBottom: '5px' }}>
                Drop files here or click to browse
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Max {MAX_SIZE_MB}MB per file · MP3, WAV, OGG, FLAC, AAC, M4A
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.webm,audio/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {uploading && (
              <div style={{
                marginTop: '15px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}>
                ⏳ Uploading...
              </div>
            )}
          </div>
        ) : (
          <div>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '15px',
            }}>
              Paste a public Google Drive file link. The song will be downloaded to the server when it's next in the queue.
            </p>

            <div style={{ marginBottom: '10px' }}>
              <label style={{
                display: 'block',
                marginBottom: '5px',
                color: 'var(--text-secondary)',
                fontSize: '12px',
              }}>
                Google Drive Link
              </label>
              <input
                className="walkman-input"
                placeholder="https://drive.google.com/file/d/..."
                value={gdriveUrl}
                onChange={(e) => setGdriveUrl(e.target.value)}
              />
            </div>

            <p style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              marginBottom: '15px',
              fontStyle: 'italic',
            }}>
              💡 Tip: Make sure the file is shared as "Anyone with the link" and it's an audio file.
            </p>

            <button
              className="walkman-btn primary"
              style={{ width: '100%', padding: '12px' }}
              onClick={handleGDriveAdd}
              disabled={addingGDrive || !gdriveUrl.trim()}
            >
              {addingGDrive ? 'Adding...' : '➕ Add to Queue'}
            </button>
          </div>
        )}

        {/* Status messages */}
        {error && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(192,57,43,0.15)',
            border: '1px solid var(--danger)',
            borderRadius: '4px',
            color: '#ff8a80',
            fontSize: '13px',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(39,174,96,0.15)',
            border: '1px solid var(--success)',
            borderRadius: '4px',
            color: '#81c784',
            fontSize: '13px',
            textAlign: 'center',
          }}>
            ✓ {success}
          </div>
        )}
      </div>
    </div>
  );
}