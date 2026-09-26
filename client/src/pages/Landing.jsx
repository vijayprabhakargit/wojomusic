import React, { useState } from 'react';

export default function Landing({ socket, onRoomCreated, onRoomJoined }) {
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState('');
  const [role, setRole] = useState('moderator');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [joinRole, setJoinRole] = useState('listener');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');
    const result = await socket.createRoom(name.trim(), role);
    setLoading(false);
    if (result.success) {
      onRoomCreated(result.roomId);
    } else {
      setError(result.error || 'Failed to create room');
    }
  };

  const handleJoin = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomIdInput.trim()) {
      setError('Please enter a room ID');
      return;
    }
    setLoading(true);
    setError('');
    const result = await socket.joinRoom(roomIdInput.trim(), name.trim(), joinRole);
    setLoading(false);
    if (result.success) {
      onRoomJoined(result.roomId);
    } else {
      setError(result.error || 'Failed to join room');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div className="cassette-frame" style={{
        maxWidth: '500px',
        width: '100%',
        padding: '40px',
      }}>
        {/* Logo / Header */}
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                  <img
                    src="/favicon.svg"
                    alt="Wojo Music"
                    style={{ width: '64px', height: '64px', marginBottom: '10px' }}
                  />
                  <h1 style={{
                    fontSize: '24px',
                    color: 'var(--accent)',
                    marginBottom: '8px',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                  }}>
                    Wojo Music
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Listen together. Real-time sync.
                  </p>
        </div>

        {/* Connection status */}
        {!socket.isConnected && (
          <div style={{
            textAlign: 'center',
            padding: '8px',
            marginBottom: '15px',
            background: 'rgba(192, 57, 43, 0.2)',
            border: '1px solid var(--danger)',
            borderRadius: '4px',
            color: 'var(--danger)',
            fontSize: '13px',
          }}>
            ⚠ Connecting to server...
          </div>
        )}

        {/* Tab Switch */}
        <div style={{
          display: 'flex',
          marginBottom: '20px',
          borderBottom: '1px solid #444',
        }}>
          <button
            className="walkman-btn"
            style={{
              flex: 1,
              borderRadius: '4px 4px 0 0',
              borderBottom: tab === 'create' ? '2px solid var(--accent)' : '2px solid transparent',
              background: tab === 'create' ? 'rgba(192,160,96,0.1)' : 'transparent',
            }}
            onClick={() => { setTab('create'); setError(''); }}
          >
            🎤 Create Room
          </button>
          <button
            className="walkman-btn"
            style={{
              flex: 1,
              borderRadius: '4px 4px 0 0',
              borderBottom: tab === 'join' ? '2px solid var(--accent)' : '2px solid transparent',
              background: tab === 'join' ? 'rgba(192,160,96,0.1)' : 'transparent',
            }}
            onClick={() => { setTab('join'); setError(''); }}
          >
            🎧 Join Room
          </button>
        </div>

        {/* Name field - common */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Your Name
          </label>
          <input
            className="walkman-input"
            placeholder="Enter your name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                tab === 'create' ? handleCreate() : handleJoin();
              }
            }}
            maxLength={30}
          />
        </div>

        {tab === 'create' ? (
          <>
            {/* Role selection for creator */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Your Role
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: 'moderator', label: '⚙ Moderator', desc: 'Can control playback & queue' },
                  { value: 'listener', label: '🎧 Listener', desc: 'Only add songs & chat' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`walkman-btn ${role === opt.value ? 'primary' : ''}`}
                    style={{ flex: 1, fontSize: '12px', padding: '10px 8px' }}
                    onClick={() => setRole(opt.value)}
                  >
                    <div>{opt.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
              <p style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                You'll be the admin since you're creating the room.
              </p>
            </div>

            <button
              className="walkman-btn primary"
              style={{ width: '100%', padding: '12px' }}
              onClick={handleCreate}
              disabled={loading || !socket.isConnected}
            >
              {loading ? 'Creating Room...' : '🎵 Create Music Room'}
            </button>
          </>
        ) : (
          <>
            {/* Room ID input */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Room ID
              </label>
              <input
                className="walkman-input"
                placeholder="Enter room ID (e.g. ABC123)..."
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoin();
                }}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center', fontSize: '20px' }}
              />
            </div>

            {/* Role selection for joiner */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Join as
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: 'moderator', label: '⚙ Moderator' },
                  { value: 'listener', label: '🎧 Listener' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`walkman-btn ${joinRole === opt.value ? 'primary' : ''}`}
                    style={{ flex: 1, fontSize: '12px', padding: '10px' }}
                    onClick={() => setJoinRole(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                You can be a moderator (control playback) or a listener (just listen & chat).
              </p>
            </div>

            <button
              className="walkman-btn primary"
              style={{ width: '100%', padding: '12px' }}
              onClick={handleJoin}
              disabled={loading || !socket.isConnected}
            >
              {loading ? 'Joining Room...' : '🎧 Join Room'}
            </button>
          </>
        )}

        {/* Error message */}
        {error && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(192, 57, 43, 0.15)',
            border: '1px solid var(--danger)',
            borderRadius: '4px',
            color: 'var(--danger)',
            textAlign: 'center',
            fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '25px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          borderTop: '1px solid #333',
          paddingTop: '15px',
        }}>
          <p>🐱 Wojo Music — listen together.</p>
        </div>
      </div>
    </div>
  );
}