import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Zap, RotateCcw } from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import { sendMessage, resetBuilding } from '../../services/api';
import { QUICK_ACTIONS, WELCOME_MESSAGE } from '../../utils/constants';
import type { ChatResponse } from '../../services/api';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
  type?: ChatResponse['message_type'];
  suggestions?: string[];
}

const SESSION_ID = `${Math.floor(Math.random() * 9000 + 1000)}-ARCH`;

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ChatPanel() {
  const { dispatch } = useBuilding();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      text: WELCOME_MESSAGE,
      timestamp: new Date(),
      type: 'info',
      suggestions: QUICK_ACTIONS.slice(0, 4),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await sendMessage(text.trim());
      if (res.updatedState) {
        dispatch({ type: 'SET_STATE', payload: res.updatedState });
      }
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: res.message,
        timestamp: new Date(),
        type: res.message_type,
        suggestions: res.suggestions?.slice(0, 4) ?? [],
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: `e-${Date.now()}`,
        role: 'ai',
        text: `Connection error: ${err instanceof Error ? err.message : 'Could not reach the backend. Make sure it is running on port 8000.'}`,
        timestamp: new Date(),
        type: 'error',
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, dispatch]);

  const handleReset = async () => {
    try {
      const state = await resetBuilding();
      dispatch({ type: 'SET_STATE', payload: state });
      setMessages([{
        id: `reset-${Date.now()}`,
        role: 'ai',
        text: 'Building reset to initial state. Ready to start fresh!',
        timestamp: new Date(),
        type: 'info',
        suggestions: QUICK_ACTIONS.slice(0, 4),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `reset-err-${Date.now()}`,
        role: 'ai',
        text: 'Failed to reset. Is the backend running?',
        timestamp: new Date(),
        type: 'error',
      }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const typeColor: Record<string, string> = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#06b6d4',
  };

  return (
    <div style={{
      width: '340px',
      minWidth: '300px',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0d14',
      borderRight: '1px solid var(--border-subtle)',
      flexShrink: 0,
      height: '100%',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '0.85rem 1rem',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#06b6d4',
          }}>
            AI ARCHITECT ASSISTANT
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
            SESSION ID: {SESSION_ID}
          </div>
        </div>
        <button
          title="Reset building"
          onClick={handleReset}
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '6px',
            padding: '0.3rem 0.5rem',
            color: '#ef4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.7rem',
            transform: 'none',
          }}
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              /* User bubble */
              <div style={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                <div style={{
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.25)',
                  borderRadius: '12px 12px 4px 12px',
                  padding: '0.6rem 0.85rem',
                  maxWidth: '85%',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  lineHeight: '1.5',
                }}>
                  {msg.text}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <User size={10} />
                  USER • {formatTime(msg.timestamp)}
                </div>
              </div>
            ) : (
              /* AI bubble */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{
                  background: 'rgba(6,182,212,0.06)',
                  border: `1px solid ${typeColor[msg.type ?? 'info'] ?? '#06b6d4'}30`,
                  borderLeft: `3px solid ${typeColor[msg.type ?? 'info'] ?? '#06b6d4'}`,
                  borderRadius: '4px 12px 12px 4px',
                  padding: '0.6rem 0.85rem',
                  maxWidth: '92%',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Bot size={10} color="#06b6d4" />
                  AI CORE • {formatTime(msg.timestamp)}
                </div>

                {/* Suggestion chips */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                    {msg.suggestions.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        style={{
                          background: 'rgba(124,58,237,0.1)',
                          border: '1px solid rgba(124,58,237,0.25)',
                          borderRadius: '20px',
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.7rem',
                          color: '#a78bfa',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          transform: 'none',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.2)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.1)';
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{
              background: 'rgba(6,182,212,0.06)',
              border: '1px solid rgba(6,182,212,0.2)',
              borderLeft: '3px solid #06b6d4',
              borderRadius: '4px 12px 12px 4px',
              padding: '0.6rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <div className="typing-dot" />
              <div className="typing-dot" style={{ animationDelay: '0.15s' }} />
              <div className="typing-dot" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div style={{
        padding: '0.5rem 0.75rem',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.3rem',
        flexShrink: 0,
      }}>
        {QUICK_ACTIONS.map(action => (
          <button
            key={action}
            onClick={() => send(action)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              transform: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124,58,237,0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
            }}
          >
            <Zap size={9} />
            {action}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{
        padding: '0.75rem',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.5rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '0.5rem 0.75rem',
          transition: 'border-color 0.2s',
        }}
          onFocus={() => {}}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Instruct the architect..."
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              maxHeight: '80px',
              overflowY: 'auto',
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? '#7c3aed' : 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: '7px',
              padding: '0.4rem 0.5rem',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              transition: 'background 0.2s',
              transform: 'none',
              flexShrink: 0,
            }}
          >
            <Send size={14} />
          </button>
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: '0.4rem', textAlign: 'center' }}>
          Enter to send • Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
