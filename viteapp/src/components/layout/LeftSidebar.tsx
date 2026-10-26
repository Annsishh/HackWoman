import { useState } from 'react';
import {
  LayoutGrid, Zap, Circle, Layers, History,
  HelpCircle, Image, X, Building2, DollarSign,
  Maximize2, Keyboard, Download, ChevronRight, Loader2,
} from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import { sendMessage } from '../../services/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 100000 ? `\u20b9${(n / 100000).toFixed(1)}L` : `\u20b9${n.toLocaleString()}`;

const ROOM_COLORS: Record<string, string> = {
  bedroom: '#8b5cf6', kitchen: '#f59e0b', washroom: '#06b6d4',
  bathroom: '#06b6d4', playroom: '#10b981', office: '#f97316',
  living: '#ec4899', dining: '#a855f7', general: '#64748b',
};
const roomColor = (t: string) => ROOM_COLORS[t?.toLowerCase()] ?? '#64748b';

// ── Panel: Overview ───────────────────────────────────────────────────────────
function OverviewPanel() {
  const { state } = useBuilding();
  const { floors, budget } = state;
  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalSqft = floors.reduce((s, f) => s + f.rooms.reduce((rs, r) => rs + (r.area_sqft ?? 0), 0), 0);
  const budgetPct = Math.round((budget.used / budget.total) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {[
        { label: 'Floors',      value: floors.length,                                        icon: <Building2 size={14} />,  color: '#06b6d4' },
        { label: 'Total Rooms', value: totalRooms,                                            icon: <Maximize2 size={14} />,  color: '#8b5cf6' },
        { label: 'Total Area',  value: totalSqft ? `${totalSqft.toLocaleString()} sqft` : '—', icon: <Layers size={14} />,   color: '#10b981' },
        { label: 'Budget Used', value: `${budgetPct}%`,                                       icon: <DollarSign size={14} />, color: budgetPct > 80 ? '#ef4444' : '#10b981' },
      ].map(c => (
        <div key={c.label} style={{
          display: 'flex', alignItems: 'center', gap: '0.65rem',
          background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
          padding: '0.6rem 0.7rem', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '6px',
            background: `${c.color}20`, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: c.color, flexShrink: 0,
          }}>{c.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>{c.value}</div>
          </div>
        </div>
      ))}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Budget</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{fmt(budget.used)} / {fmt(budget.total)}</span>
        </div>
        <div style={{ height: '5px', borderRadius: '99px', background: 'rgba(255,255,255,0.07)' }}>
          <div style={{ height: '100%', borderRadius: '99px', transition: 'width 0.4s ease', width: `${Math.min(budgetPct, 100)}%`, background: budgetPct > 80 ? '#ef4444' : 'linear-gradient(90deg,#7c3aed,#06b6d4)' }} />
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: '5px' }}>Remaining: {fmt(budget.remaining)}</div>
      </div>
      {floors.length > 0 ? (
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Floors</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '160px', overflowY: 'auto' }}>
            {floors.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.025)', borderRadius: '6px', padding: '0.35rem 0.55rem', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Floor {f.number}</span>
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                  {f.rooms.slice(0, 5).map(r => (
                    <div key={r.id} title={r.name} style={{ width: '7px', height: '7px', borderRadius: '2px', background: roomColor(r.type) }} />
                  ))}
                  {f.rooms.length > 5 && <span style={{ fontSize: '0.5rem', color: 'var(--text-tertiary)' }}>+{f.rooms.length - 5}</span>}
                </div>
                <span style={{ color: '#06b6d4', fontWeight: 700 }}>{f.rooms.length}R</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>No floors yet — ask the AI to start building!</p>
      )}
    </div>
  );
}

// ── Panel: Quick Commands ─────────────────────────────────────────────────────

type RoomSpec = { type: string; count: number };
type Preset   = { label: string; emoji: string; color: string; desc: string; rooms: RoomSpec[] };

const PRESETS: Preset[] = [
  { label: '1BHK',       emoji: '🏠', color: '#8b5cf6', desc: '1 bed · 1 kitchen · 1 bath',
    rooms: [{ type: 'bedroom', count: 1 }, { type: 'kitchen', count: 1 }, { type: 'washroom', count: 1 }] },
  { label: '2BHK',       emoji: '🏡', color: '#06b6d4', desc: '2 bed · 1 kitchen · 1 bath',
    rooms: [{ type: 'bedroom', count: 2 }, { type: 'kitchen', count: 1 }, { type: 'washroom', count: 1 }] },
  { label: '3BHK',       emoji: '🏗', color: '#10b981', desc: '3 bed · 1 kitchen · 2 baths',
    rooms: [{ type: 'bedroom', count: 3 }, { type: 'kitchen', count: 1 }, { type: 'washroom', count: 2 }] },
  { label: '4BHK',       emoji: '🏢', color: '#a855f7', desc: '4 bed · 2 kitchen · 2 baths',
    rooms: [{ type: 'bedroom', count: 4 }, { type: 'kitchen', count: 2 }, { type: 'washroom', count: 2 }] },
  { label: 'Studio',     emoji: '🛖', color: '#ec4899', desc: '1 bed · 1 kitchen · 1 bath',
    rooms: [{ type: 'bedroom', count: 1 }, { type: 'kitchen', count: 1 }, { type: 'washroom', count: 1 }] },
  { label: 'Office Flr', emoji: '💼', color: '#f97316', desc: '4 offices · 1 bath',
    rooms: [{ type: 'office', count: 4 }, { type: 'washroom', count: 1 }] },
  { label: 'Penthouse',  emoji: '✨', color: '#f59e0b', desc: '3 bed · 2 kitchen · 3 baths · living · dining',
    rooms: [{ type: 'bedroom', count: 3 }, { type: 'kitchen', count: 2 }, { type: 'washroom', count: 3 }, { type: 'living', count: 1 }, { type: 'dining', count: 1 }] },
  { label: 'Commercial', emoji: '🏬', color: '#64748b', desc: '6 offices · 2 baths',
    rooms: [{ type: 'office', count: 6 }, { type: 'washroom', count: 2 }] },
];

type RoomAdd = { label: string; emoji: string; color: string; type: string; count: number };
const ROOM_ADDS: RoomAdd[] = [
  { label: 'Bedroom',     emoji: '🛏', color: '#8b5cf6', type: 'bedroom',  count: 1 },
  { label: '2 Bedrooms',  emoji: '🛏', color: '#8b5cf6', type: 'bedroom',  count: 2 },
  { label: 'Kitchen',     emoji: '🍳', color: '#f59e0b', type: 'kitchen',  count: 1 },
  { label: 'Washroom',    emoji: '🚿', color: '#06b6d4', type: 'washroom', count: 1 },
  { label: '2 Washrooms', emoji: '🚿', color: '#06b6d4', type: 'washroom', count: 2 },
  { label: 'Office',      emoji: '💼', color: '#f97316', type: 'office',   count: 1 },
  { label: '2 Offices',   emoji: '💼', color: '#f97316', type: 'office',   count: 2 },
  { label: 'Living Room', emoji: '🛋', color: '#ec4899', type: 'living',   count: 1 },
  { label: 'Dining Room', emoji: '🍽', color: '#a855f7', type: 'dining',   count: 1 },
  { label: 'Playroom',    emoji: '🎮', color: '#10b981', type: 'playroom', count: 1 },
];

function QuickCommandsPanel() {
  const { state, dispatch } = useBuilding();
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const lastFloor = state.floors.length > 0
    ? state.floors[state.floors.length - 1].number
    : null;

  const call = async (msg: string) => {
    const res = await sendMessage(msg);
    if (res.updatedState) dispatch({ type: 'SET_STATE', payload: res.updatedState });
    return res;
  };

  const showFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Preset: 1) add floor, 2) chain room additions sequentially
  const firePreset = async (preset: Preset) => {
    if (loading) return;
    setLoading(preset.label);
    setFeedback(null);
    try {
      const flRes = await call('add a floor');
      if (flRes.message_type === 'error' || flRes.message_type === 'warning') {
        showFeedback(flRes.message?.split('.')[0] ?? 'Failed to add floor', false);
        return;
      }
      const newFloor = flRes.updatedState?.floors?.length ?? (state.floors.length + 1);
      for (const room of preset.rooms) {
        const suffix = room.count > 1 ? 's' : '';
        await call(`add ${room.count} ${room.type}${suffix} to floor ${newFloor}`);
      }
      showFeedback(`${preset.label} built on floor ${newFloor}!`, true);
    } catch (e) {
      showFeedback((e as Error).message || 'Request failed', false);
    } finally {
      setLoading(null);
    }
  };

  // Single room: target last floor or create one first
  const fireRoom = async (r: RoomAdd) => {
    if (loading) return;
    setLoading(r.label);
    setFeedback(null);
    try {
      let target = lastFloor;
      if (target === null) {
        const flRes = await call('add a floor');
        if (flRes.message_type === 'error') { showFeedback('Could not add floor', false); return; }
        target = flRes.updatedState?.floors?.length ?? 1;
      }
      const suffix = r.count > 1 ? 's' : '';
      const res = await call(`add ${r.count} ${r.type}${suffix} to floor ${target}`);
      const ok = res.message_type !== 'error' && res.message_type !== 'warning';
      showFeedback(res.message?.split('.')[0] ?? 'Done!', ok);
    } catch (e) {
      showFeedback((e as Error).message || 'Request failed', false);
    } finally {
      setLoading(null);
    }
  };

  const Btn = ({ label, emoji, color, btnKey, sub, onClick }:
    { label: string; emoji: string; color: string; btnKey: string; sub?: string; onClick: () => void }) => (
    <button onClick={onClick} disabled={!!loading} style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      background: loading === btnKey ? `${color}18` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${loading === btnKey ? color + '55' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '7px', padding: '0.45rem 0.65rem',
      cursor: loading ? 'wait' : 'pointer',
      color: loading === btnKey ? color : 'var(--text-secondary)',
      width: '100%', fontSize: '0.72rem', fontWeight: 500,
      transition: 'all 0.15s', textAlign: 'left',
      opacity: loading && loading !== btnKey ? 0.45 : 1,
    }}
      onMouseEnter={e => { if (!loading) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = color + '50'; b.style.color = color; }}}
      onMouseLeave={e => { if (loading !== btnKey) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(255,255,255,0.06)'; b.style.color = 'var(--text-secondary)'; }}}
    >
      <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{label}</div>
        {sub && <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>{sub}</div>}
      </div>
      {loading === btnKey
        ? <Loader2 size={11} style={{ color, animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        : <span style={{ fontSize: '0.6rem', color, opacity: 0.55, flexShrink: 0 }}>↵</span>}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '0.4rem 0.6rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Room target:</span>
        <span style={{ color: lastFloor !== null ? '#06b6d4' : '#f59e0b', fontWeight: 700 }}>
          {lastFloor !== null ? `Floor ${lastFloor}` : 'New floor (auto)'}
        </span>
      </div>
      {feedback && (
        <div style={{ padding: '0.45rem 0.65rem', borderRadius: '7px', fontSize: '0.68rem', lineHeight: 1.4, background: feedback.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${feedback.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: feedback.ok ? '#6ee7b7' : '#f87171' }}>
          {feedback.ok ? '✓' : '✗'} {feedback.msg}
        </div>
      )}
      <div>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#a855f7', textTransform: 'uppercase', marginBottom: '0.4rem' }}>✨ New Floor Preset</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          {PRESETS.map(p => <Btn key={p.label} btnKey={p.label} label={p.label} emoji={p.emoji} color={p.color} sub={p.desc} onClick={() => firePreset(p)} />)}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#06b6d4', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
          ＋ Room → {lastFloor !== null ? `Floor ${lastFloor}` : 'New Floor'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          {ROOM_ADDS.map(r => <Btn key={r.label} btnKey={r.label} label={r.label} emoji={r.emoji} color={r.color} onClick={() => fireRoom(r)} />)}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Panel: Geometry ───────────────────────────────────────────────────────────
function GeometryPanel() {
  const { state } = useBuilding();
  const totalRooms = state.floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalSqft  = state.floors.reduce((s, f) => s + f.rooms.reduce((rs, r) => rs + (r.area_sqft ?? 0), 0), 0);
  const fl = state.floors.length;
  const stats = [
    { label: 'Est. Floor Area',     value: fl ? `${(fl * 1200).toLocaleString()} sqft` : '—' },
    { label: 'Room Area Total',     value: totalSqft ? `${totalSqft.toLocaleString()} sqft` : '—' },
    { label: 'Avg Rooms / Floor',   value: fl ? (totalRooms / fl).toFixed(1) : '—' },
    { label: 'Plot Coverage',       value: fl ? `${Math.min(fl * 18, 100)}%` : '—' },
    { label: 'Floor-Area Ratio',    value: fl ? (fl * 0.8).toFixed(2) : '—' },
    { label: 'Setback (all sides)', value: '3 m' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <p style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', margin: '0 0 0.25rem', lineHeight: 1.5 }}>Computed geometry metrics based on your current building.</p>
      {stats.map(s => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>{s.label}</span>
          <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#06b6d4' }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Panel: Layers ─────────────────────────────────────────────────────────────
function LayersPanel() {
  const { state } = useBuilding();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (state.floors.length === 0) return <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>No floors to display yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <p style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', margin: '0 0 0.25rem', lineHeight: 1.5 }}>Inspect each floor and its rooms.</p>
      {[...state.floors].reverse().map(f => (
        <div key={f.id}>
          <button onClick={() => setExpanded(expanded === f.id ? null : f.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: expanded === f.id ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${expanded === f.id ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '7px', padding: '0.45rem 0.65rem', cursor: 'pointer', color: 'var(--text-primary)', transition: 'all 0.18s' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>Floor {f.number}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.63rem', color: '#06b6d4' }}>{f.rooms.length}R</span>
              <ChevronRight size={12} style={{ transform: expanded === f.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s', color: 'var(--text-tertiary)' }} />
            </div>
          </button>
          {expanded === f.id && (
            <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.2rem' }}>
              {f.rooms.length === 0
                ? <span style={{ fontSize: '0.67rem', color: 'var(--text-tertiary)', padding: '0.3rem 0.5rem' }}>No rooms</span>
                : f.rooms.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.55rem', background: 'rgba(255,255,255,0.02)', borderRadius: '5px', borderLeft: `2px solid ${roomColor(r.type)}` }}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '1px', background: roomColor(r.type), flexShrink: 0 }} />
                    <span style={{ fontSize: '0.69rem', color: 'var(--text-secondary)', flex: 1 }}>{r.name}</span>
                    <span style={{ fontSize: '0.59rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{r.type}</span>
                    {r.area_sqft ? <span style={{ fontSize: '0.59rem', color: '#06b6d4' }}>{r.area_sqft}sqft</span> : null}
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Panel: History ────────────────────────────────────────────────────────────
function HistoryPanel() {
  const { state, dispatch } = useBuilding();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.1rem' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{state.history.length} event{state.history.length !== 1 ? 's' : ''}</span>
        {state.history.length > 0 && (
          <button onClick={() => dispatch({ type: 'RESET' })} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '5px', padding: '0.18rem 0.45rem', fontSize: '0.6rem', color: '#f87171', cursor: 'pointer' }}>Reset All</button>
        )}
      </div>
      {state.history.length === 0
        ? <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>No actions recorded yet.</p>
        : [...state.history].reverse().map((h, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '7px', padding: '0.5rem 0.65rem', border: '1px solid rgba(255,255,255,0.05)', borderLeft: '2px solid #06b6d4' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{h.action.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{new Date(h.timestamp).toLocaleString()}</div>
            {h.details && <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginTop: '3px' }}>{h.details}</div>}
          </div>
        ))}
    </div>
  );
}

// ── Panel: Help ───────────────────────────────────────────────────────────────
function HelpPanel() {
  const shortcuts = [
    { key: 'Drag Canvas',   desc: 'Rotate the 3D building view' },
    { key: 'Scroll',        desc: 'Zoom in / out on the 3D scene' },
    { key: 'Click Room',    desc: 'Inspect room type and name' },
    { key: 'Reset Btn',     desc: 'Snap camera back to default' },
    { key: 'Add Floor Btn', desc: 'Add a new floor via AI' },
    { key: 'Labels Btn',    desc: 'Toggle floor label visibility' },
    { key: 'Chat → AI',     desc: 'Natural language building commands' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <p style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', margin: '0 0 0.25rem', lineHeight: 1.5 }}>Keyboard &amp; mouse shortcuts for the canvas.</p>
      {shortcuts.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', padding: '0.45rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '4px', padding: '1px 6px', fontSize: '0.59rem', fontFamily: 'monospace', color: '#67e8f9', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.key}</span>
          <span style={{ fontSize: '0.69rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s.desc}</span>
        </div>
      ))}
      <div style={{ marginTop: '0.25rem', padding: '0.55rem 0.7rem', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '7px', fontSize: '0.68rem', color: '#c4b5fd', lineHeight: 1.5 }}>
        <Keyboard size={11} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }} />
        Try: <em>"Add 3 floors with 2 bedrooms and a kitchen each"</em>
      </div>
    </div>
  );
}

// ── Panel: Export ─────────────────────────────────────────────────────────────
function ExportPanel() {
  const { state } = useBuilding();
  const [done, setDone] = useState(false);

  const doExport = (format: 'json' | 'txt') => {
    let content: string;
    let mime: string;
    if (format === 'json') {
      content = JSON.stringify(state, null, 2);
      mime = 'application/json';
    } else {
      const lines = ['ARCHI-MIND AI — Project Summary', '='.repeat(36), '', `Floors: ${state.floors.length}`, `Budget Used: ${fmt(state.budget.used)} / ${fmt(state.budget.total)}`, ''];
      state.floors.forEach(f => { lines.push(`Floor ${f.number}: ${f.rooms.length} room(s)`); f.rooms.forEach(r => lines.push(`  - ${r.name} (${r.type})${r.area_sqft ? ` — ${r.area_sqft} sqft` : ''}`)); });
      content = lines.join('\n');
      mime = 'text/plain';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archi-mind-project.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <p style={{ fontSize: '0.71rem', color: 'var(--text-tertiary)', margin: '0 0 0.1rem', lineHeight: 1.5 }}>Download your current project.</p>
      {([['json', '{ }', '#f59e0b', 'Full project state as JSON'], ['txt', '📄', '#06b6d4', 'Human-readable summary']] as const).map(([id, icon, color, desc]) => (
        <button key={id} onClick={() => doExport(id)} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '0.6rem 0.7rem', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', width: '100%', transition: 'all 0.18s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = color + '55')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
          <span style={{ fontSize: '1.05rem' }}>{icon}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{id.toUpperCase()}</div><div style={{ fontSize: '0.61rem', color: 'var(--text-tertiary)' }}>{desc}</div></div>
          <Download size={13} style={{ color, flexShrink: 0 }} />
        </button>
      ))}
      {done && <div style={{ padding: '0.5rem 0.7rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: '7px', fontSize: '0.7rem', color: '#6ee7b7' }}>✓ File downloaded!</div>}
      <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>
        Floors: <strong style={{ color: 'var(--text-secondary)' }}>{state.floors.length}</strong> &nbsp;|&nbsp;
        Rooms: <strong style={{ color: 'var(--text-secondary)' }}>{state.floors.reduce((s, f) => s + f.rooms.length, 0)}</strong>
      </div>
    </div>
  );
}

// ── Sidebar config ────────────────────────────────────────────────────────────
type PanelId = 'grid' | 'draw' | 'geo' | 'layers' | 'history' | 'help' | 'image';

const PANELS: Record<PanelId, { label: string; title: string; icon: React.ReactNode; content: React.ReactNode }> = {
  grid:    { label: 'Overview',  title: 'Project Overview',  icon: <LayoutGrid size={18} />, content: <OverviewPanel /> },
  draw:    { label: 'Quick',     title: 'Quick Commands',    icon: <Zap size={18} />,        content: <QuickCommandsPanel /> },
  geo:     { label: 'Geometry',  title: 'Geometry Metrics',  icon: <Circle size={18} />,     content: <GeometryPanel /> },
  layers:  { label: 'Layers',    title: 'Floor Layers',      icon: <Layers size={18} />,     content: <LayersPanel /> },
  history: { label: 'History',   title: 'Project History',   icon: <History size={18} />,    content: <HistoryPanel /> },
  help:    { label: 'Help',      title: 'Help & Shortcuts',  icon: <HelpCircle size={18} />, content: <HelpPanel /> },
  image:   { label: 'Export',    title: 'Export Project',    icon: <Image size={18} />,      content: <ExportPanel /> },
};

const TOP: PanelId[]    = ['grid', 'draw', 'geo', 'layers', 'history'];
const BOTTOM: PanelId[] = ['help', 'image'];

// ── Main component ────────────────────────────────────────────────────────────
export function LeftSidebar() {
  const [open, setOpen] = useState<PanelId | null>(null);
  const toggle = (id: PanelId) => setOpen(prev => prev === id ? null : id);

  const IconBtn = ({ id }: { id: PanelId }) => {
    const p = PANELS[id];
    const active = open === id;
    return (
      <button title={p.label} onClick={() => toggle(id)} style={{
        width: '40px', height: '40px', borderRadius: '8px',
        background: active ? 'rgba(6,182,212,0.15)' : 'transparent',
        border: active ? '1px solid rgba(6,182,212,0.4)' : '1px solid transparent',
        color: active ? '#06b6d4' : 'var(--text-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.18s', padding: 0, transform: 'none',
      }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}}
      >
        {p.icon}
      </button>
    );
  };

  const panel = open ? PANELS[open] : null;

  return (
    <div style={{ display: 'flex', flexShrink: 0 }}>
      {/* Icon rail */}
      <aside style={{ width: '52px', background: '#0d0d14', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem 0', gap: '0.25rem', flexShrink: 0, zIndex: 10 }}>
        <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: '60px', userSelect: 'none', marginBottom: '0.5rem' }}>SYSTEM A</div>
        <div style={{ width: '24px', height: '1px', background: 'var(--border-subtle)', marginBottom: '0.5rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
          {TOP.map(id => <IconBtn key={id} id={id} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {BOTTOM.map(id => <IconBtn key={id} id={id} />)}
        </div>
      </aside>

      {/* Slide-out panel */}
      {panel && (
        <div style={{ width: '240px', background: '#0f0f1a', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', animation: 'sidebarSlideIn 0.2s ease-out', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(6,182,212,0.05)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ color: '#06b6d4' }}>{panel.icon}</span>
              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.03em' }}>{panel.title}</span>
            </div>
            <button onClick={() => setOpen(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem' }}>
            {panel.content}
          </div>
        </div>
      )}

      <style>{`
        @keyframes sidebarSlideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
