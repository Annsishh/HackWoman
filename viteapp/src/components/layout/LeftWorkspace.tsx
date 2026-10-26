import { useState } from 'react';
import { LayoutGrid, MessageSquare } from 'lucide-react';
import { ChatPanel } from '../chat/ChatPanel';
import { DesignPanel } from '../visualizer/DesignPanel';

type Mode = 'design' | 'chat';

/**
 * Left column of the home page: hands-on design controls or the AI chat.
 * Keeping both here leaves the 3D view free of overlays.
 */
export function LeftWorkspace() {
  const [mode, setMode] = useState<Mode>('design');

  return (
    <div style={{
      width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0d0d14', borderRight: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', gap: '0.3rem', padding: '0.6rem 0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
        {([['design', 'Design your home', <LayoutGrid key="d" size={14} />], ['chat', 'AI Chat', <MessageSquare key="c" size={14} />]] as [Mode, string, React.ReactNode][]).map(([id, label, icon]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            padding: '0.5rem', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
            background: mode === id ? 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))' : 'transparent',
            border: `1px solid ${mode === id ? 'rgba(124,58,237,0.6)' : 'var(--border-subtle)'}`,
            color: mode === id ? '#f1f5f9' : 'var(--text-secondary)',
          }}>{icon}{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: mode === 'design' ? 'flex' : 'none', flexDirection: 'column' }}>
        <DesignPanel />
      </div>
      {/* Chat stays mounted so the conversation survives switching tabs */}
      <div style={{ flex: 1, minHeight: 0, display: mode === 'chat' ? 'flex' : 'none' }}>
        <ChatPanel />
      </div>
    </div>
  );
}
