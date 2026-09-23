import React from 'react';

export default function Participants({ participants = [], myInfo, onClose }) {
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
          👥 Room Members
          <span style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            background: 'rgba(192,160,96,0.1)',
            padding: '1px 6px',
            borderRadius: '10px',
          }}>
            {participants.length}
          </span>
        </span>
        {onClose && (
          <button
            className="walkman-btn"
            onClick={onClose}
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            Back to Chat
          </button>
        )}
      </div>

      {/* Participants list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px',
      }}>
        {participants.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              marginBottom: '6px',
              borderRadius: '6px',
              background: p.id === myInfo?.id ? 'rgba(192,160,96,0.1)' : 'rgba(255,255,255,0.02)',
              border: p.id === myInfo?.id ? '1px solid rgba(192,160,96,0.3)' : '1px solid transparent',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: p.id === myInfo?.id
                ? 'linear-gradient(145deg, var(--accent), #8B7355)'
                : 'linear-gradient(145deg, #555, #333)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 'bold',
              color: p.id === myInfo?.id ? '#1a1a1a' : 'var(--text-primary)',
            }}>
              {p.name.charAt(0).toUpperCase()}
            </div>

            {/* Name & role */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                color: p.id === myInfo?.id ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: p.id === myInfo?.id ? 'bold' : 'normal',
              }}>
                {p.name}
                {p.id === myInfo?.id && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                    (you)
                  </span>
                )}
              </div>
              <div style={{ marginTop: '3px' }}>
                <span className={`role-badge ${p.role}`}>{p.role}</span>
              </div>
            </div>

            {/* Joined time */}
            <div style={{
              fontSize: '10px',
              color: 'var(--text-secondary)',
              textAlign: 'right',
            }}>
              {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {participants.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            padding: '30px',
            fontSize: '13px',
          }}>
            No one is here yet. Share the room ID!
          </div>
        )}
      </div>
    </div>
  );
}