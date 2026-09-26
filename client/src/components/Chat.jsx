import React, { useState, useRef, useEffect } from 'react';

export default function Chat({
  messages = [],
  onSend,
  myInfo,
  participants = [],
  showParticipants,
  onToggleParticipants
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Auto-scroll to bottom on new messages — scroll the container directly
    useEffect(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, [messages.length]);

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by sender for cleaner display
  const formatTime = (timestamp) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        <button
          className="walkman-btn"
          onClick={onToggleParticipants}
          style={{
            padding: '4px 10px',
            fontSize: '13px',
            background: showParticipants ? 'rgba(192,160,96,0.1)' : 'none',
            borderColor: showParticipants ? 'var(--accent)' : '#555',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          👥
          <span style={{ fontSize: '12px' }}>{participants.length}</span>
          {showParticipants ? ' ▲' : ' ▼'}
        </button>

        <span style={{
          fontSize: '14px',
          color: 'var(--accent)',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          💬 Live Chat
        </span>
      </div>

      {showParticipants ? (
        /* Participants Panel (expanded) */
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px',
        }}>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '10px',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
            Room Members
          </div>
          {participants.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                marginBottom: '4px',
                borderRadius: '6px',
                background: p.id === myInfo?.id ? 'rgba(192,160,96,0.1)' : 'rgba(255,255,255,0.02)',
                border: p.id === myInfo?.id ? '1px solid rgba(192,160,96,0.3)' : '1px solid transparent',
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(145deg, var(--accent), #8B7355)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                color: '#1a1a1a',
                fontWeight: 'bold',
              }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '13px',
                  color: p.id === myInfo?.id ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: p.id === myInfo?.id ? 'bold' : 'normal',
                }}>
                  {p.name}
                  {p.id === myInfo?.id && (
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                      (you)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className={`role-badge ${p.role}`}>{p.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Chat Messages */
        <div
          ref={chatContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px',
          }}
        >
          {messages.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '80px',
              color: 'var(--text-secondary)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>💬</div>
              <div style={{ fontSize: '12px' }}>No messages yet</div>
              <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.7 }}>
                Be the first to say something!
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="chat-message"
                style={{
                  marginBottom: '8px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: msg.isSystem
                    ? 'rgba(192,160,96,0.08)'
                    : msg.senderId === myInfo?.id
                      ? 'rgba(192,160,96,0.12)'
                      : 'transparent',
                  borderLeft: msg.isSystem ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                {msg.isSystem ? (
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--accent)',
                    fontStyle: 'italic',
                    textAlign: 'center',
                  }}>
                    {msg.message}
                  </div>
                ) : (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '2px',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 'bold',
                          color: msg.senderId === myInfo?.id ? 'var(--accent)' : '#8ab4f8',
                        }}>
                          {msg.sender}
                        </span>
                        {msg.role && msg.role !== 'listener' && (
                          <span className={`role-badge ${msg.role}`} style={{ fontSize: '8px' }}>
                            {msg.role === 'admin' ? 'Admin' : 'Mod'}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '10px',
                        color: 'var(--text-secondary)',
                      }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      wordBreak: 'break-word',
                    }}>
                      {msg.message}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      {!showParticipants && (
        <div style={{
          padding: '10px',
          borderTop: '1px solid rgba(192,160,96,0.2)',
          display: 'flex',
          gap: '8px',
        }}>
          <input
            className="walkman-input"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={500}
            style={{ fontSize: '13px' }}
          />
          <button
            className="walkman-btn primary"
            onClick={handleSend}
            disabled={!input.trim()}
            style={{ padding: '8px 14px', fontSize: '13px' }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}