import { useState, useRef, useCallback } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Plus, Eye, EyeOff, Layers } from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import { sendMessage } from '../../services/api';
import type { Floor } from '../../context/BuildingContext';

/* ── Palette ── */
const PALETTE = [
  { top: '#3d7a8a', front: '#205060', side: '#163a47', back: '#102e38', bottom: '#0a1e26', label: '#7ecfdf' },
  { top: '#3d5a4c', front: '#243d30', side: '#162819', back: '#0e1c12', bottom: '#081008', label: '#6db88e' },
  { top: '#7a3a50', front: '#521e30', side: '#3a1220', back: '#220a14', bottom: '#140608', label: '#d4849a' },
  { top: '#6a5a2a', front: '#463a14', side: '#2e250a', back: '#1a1506', bottom: '#100d04', label: '#d4b86a' },
  { top: '#3a3a8a', front: '#222260', side: '#141440', back: '#0c0c28', bottom: '#080818', label: '#8a8ad4' },
  { top: '#6a2a8a', front: '#461460', side: '#2c0a40', back: '#1a0628', bottom: '#100418', label: '#b88ad4' },
  { top: '#2a7a5a', front: '#145a38', side: '#0a3a22', back: '#062214', bottom: '#04140c', label: '#5ad4a8' },
  { top: '#7a4a2a', front: '#543010', side: '#361e08', back: '#201206', bottom: '#140c04', label: '#d49a5a' },
  { top: '#2a5a7a', front: '#143a5a', side: '#0a2438', back: '#061626', bottom: '#041018', label: '#5aaad4' },
  { top: '#7a2a4a', front: '#52142c', side: '#360a1a', back: '#200610', bottom: '#14040a', label: '#d45a8a' },
];
const pc = (i: number) => PALETTE[i % PALETTE.length];

/* ── Room type metadata ── */
const ROOM_META: Record<string, { symbol: string; color: string; label: string }> = {
  bedroom:  { symbol: '🛏', color: '#7ecfdf', label: 'BED' },
  bathroom: { symbol: '🚿', color: '#60a5fa', label: 'BATH' },
  kitchen:  { symbol: '🍳', color: '#fbbf24', label: 'KIT' },
  hallway:  { symbol: '🚪', color: '#a3e635', label: 'HALL' },
  office:   { symbol: '💼', color: '#c084fc', label: 'OFC' },
  store:    { symbol: '📦', color: '#f97316', label: 'STR' },
  general:  { symbol: '◻', color: '#94a3b8', label: 'RM' },
};

/* ── Building geometry ── */
const BASE_W = 220;
const BASE_D = 160;
const FLOOR_H = 60;

interface FloorBlockProps {
  floor: Floor;
  index: number;
  totalFloors: number;
  shape: string;
  showLabels: boolean;
}

function FloorBlock({ floor, index, shape, showLabels }: FloorBlockProps) {
  const colors = pc(index);

  const scale = shape === 'pyramid' ? Math.pow(0.82, index) : 1;
  const W = BASE_W * scale;
  const D = BASE_D * scale;
  const H = FLOOR_H;
  const offsetX = (BASE_W - W) / 2;
  const brightness = Math.max(0.7, 1 - index * 0.02);

  const faceStyle = (bg: string, bright: number): React.CSSProperties => ({
    position: 'absolute',
    background: bg,
    border: `1px solid ${colors.label}18`,
    filter: `brightness(${bright})`,
    boxSizing: 'border-box',
    backfaceVisibility: 'visible',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: `${offsetX}px`,
        width: `${W}px`,
        height: `${H}px`,
        transformStyle: 'preserve-3d',
        transform: `translateY(${-index * FLOOR_H}px) translateZ(${(BASE_D - D) / 2}px)`,
        transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {/* TOP face */}
      <div style={{
        ...faceStyle(`linear-gradient(135deg, ${colors.top}, ${colors.front}bb)`, brightness + 0.2),
        width: `${W}px`,
        height: `${D}px`,
        transformOrigin: 'top center',
        transform: `rotateX(-90deg)`,
        top: 0,
        left: 0,
      }}>
        <div style={{ position: 'absolute', inset: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignContent: 'flex-start' }}>
          {floor.rooms.map((room, ri) => {
            const meta = ROOM_META[room.type] ?? ROOM_META['general'];
            return (
              <div
                key={ri}
                title={room.name}
                style={{
                  width: '22px', height: '18px',
                  background: `${meta.color}22`,
                  border: `1px solid ${meta.color}55`,
                  borderRadius: '3px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', lineHeight: 1,
                }}
              >
                {meta.symbol}
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM face */}
      <div style={{
        ...faceStyle(colors.bottom, brightness * 0.5),
        width: `${W}px`,
        height: `${D}px`,
        transformOrigin: 'bottom center',
        transform: `rotateX(90deg)`,
        bottom: 0,
        left: 0,
      }} />

      {/* FRONT face (positive Z) */}
      <div style={{
        ...faceStyle(`linear-gradient(180deg, ${colors.front}, ${colors.side})`, brightness),
        width: `${W}px`,
        height: `${H}px`,
        transform: `translateZ(${D}px)`,
        top: 0,
        left: 0,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '5px 10px',
      }}>
        {/* Windows */}
        <div style={{ position: 'absolute', top: '8px', left: '10px', right: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Array.from({ length: Math.min(floor.rooms.length + 1, 6) }).map((_, wi) => (
            <div key={wi} style={{ width: '20px', height: '26px', background: `${colors.label}28`, border: `1px solid ${colors.label}40`, borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
        {showLabels && (
          <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.12em', color: colors.label, textShadow: `0 0 8px ${colors.label}80`, zIndex: 1 }}>
            FLOOR {String(floor.number).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* BACK face (negative Z) */}
      <div style={{
        ...faceStyle(`linear-gradient(180deg, ${colors.back}, ${colors.bottom})`, brightness * 0.7),
        width: `${W}px`,
        height: `${H}px`,
        transform: `translateZ(0px) rotateY(180deg)`,
        top: 0,
        left: 0,
      }}>
        <div style={{ position: 'absolute', top: '8px', left: '10px', right: '10px', display: 'flex', gap: '6px' }}>
          {Array.from({ length: Math.min(floor.rooms.length, 4) }).map((_, wi) => (
            <div key={wi} style={{ width: '18px', height: '24px', background: `${colors.label}18`, border: `1px solid ${colors.label}28`, borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
      </div>

      {/* RIGHT face (positive X) */}
      <div style={{
        ...faceStyle(`linear-gradient(180deg, ${colors.side}ee, ${colors.side})`, brightness * 0.75),
        width: `${D}px`,
        height: `${H}px`,
        transformOrigin: 'left center',
        transform: `rotateY(90deg)`,
        top: 0,
        left: `${W}px`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: '5px 7px',
      }}>
        <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '5px' }}>
          {Array.from({ length: Math.min(2, Math.ceil(D / 60)) }).map((_, wi) => (
            <div key={wi} style={{ width: '14px', height: '22px', background: `${colors.label}20`, border: `1px solid ${colors.label}30`, borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
        <span style={{ fontSize: '0.48rem', fontWeight: 700, color: colors.label, opacity: 0.85, letterSpacing: '0.06em', background: `${colors.label}15`, padding: '2px 5px', borderRadius: '6px', border: `1px solid ${colors.label}25`, whiteSpace: 'nowrap' }}>
          {floor.rooms.length}R
        </span>
      </div>

      {/* LEFT face (negative X) */}
      <div style={{
        ...faceStyle(`linear-gradient(180deg, ${colors.back}cc, ${colors.bottom})`, brightness * 0.6),
        width: `${D}px`,
        height: `${H}px`,
        transformOrigin: 'right center',
        transform: `rotateY(-90deg)`,
        top: 0,
        left: 0,
      }}>
        <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '5px' }}>
          {Array.from({ length: Math.min(2, Math.ceil(D / 60)) }).map((_, wi) => (
            <div key={wi} style={{ width: '14px', height: '22px', background: `${colors.label}15`, border: `1px solid ${colors.label}22`, borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export function BuildingVisualizer() {
  const { state, dispatch } = useBuilding();
  const [zoom, setZoom] = useState(0.9);
  const [showLabels, setShowLabels] = useState(true);
  const [adding, setAdding] = useState(false);
  const [fps] = useState(144);

  // Full 360° rotation on both axes
  const [rotY, setRotY] = useState(-35);
  const [rotX, setRotX] = useState(-22);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setRotY(r => r + dx * 0.6);
    setRotX(r => Math.max(-90, Math.min(90, r - dy * 0.4)));
  }, []);

  const stopDrag = useCallback(() => { isDragging.current = false; }, []);

  const floors = state.floors;
  const totalFloors = floors.length;
  const shape = state.constraints?.shape || 'rectangle';

  const handleAddFloor = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await sendMessage('add a floor');
      if (res.updatedState) dispatch({ type: 'SET_STATE', payload: res.updatedState });
    } catch { /* ignore */ }
    finally { setAdding(false); }
  };

  const handleReset = async () => {
    try {
      const res = await sendMessage('reset building');
      if (res.updatedState) dispatch({ type: 'SET_STATE', payload: res.updatedState });
    } catch { /* ignore */ }
  };

  const displayRotY = Math.round(((rotY % 360) + 360) % 360);
  const displayRotX = Math.round(rotX);
  const buildingHeight = totalFloors * FLOOR_H;

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {/* ── Metadata bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.5rem',
        padding: '0.5rem 1.25rem',
        background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.07em',
        color: 'var(--text-tertiary)', flexShrink: 0,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          RENDER: VULKAN 3D
        </span>
        <span>COORDS: 40.7128° N, 74.0060° W</span>
        <span style={{ color: '#06b6d4' }}>ZOOM: {zoom.toFixed(1)}X</span>
        <span style={{ color: '#f59e0b' }}>ROT Y: {displayRotY}°</span>
        <span style={{ color: '#f59e0b' }}>ROT X: {displayRotX}°</span>
        <span style={{ color: '#a78bfa' }}>SHAPE: {shape.toUpperCase()}</span>
        <span style={{ marginLeft: 'auto' }}>FPS: {fps}</span>
      </div>

      {/* ── Main canvas ── */}
      <div
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isDragging.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          perspective: '1200px',
        }}
        onMouseDown={onMouseDown}
      >
        {/* Grid bg */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

        {/* Radial glow */}
        <div style={{
          position: 'absolute', width: '600px', height: '600px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(6,182,212,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Drag hint */}
        {totalFloors > 0 && (
          <div style={{
            position: 'absolute', top: '0.75rem', right: '1rem',
            fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--text-tertiary)',
            fontWeight: 600, pointerEvents: 'none',
          }}>
            DRAG TO ROTATE • 360°
          </div>
        )}

        {totalFloors === 0 ? (
          <EmptyState onAddFloor={handleAddFloor} adding={adding} />
        ) : (
          <div style={{
            position: 'relative',
            transformStyle: 'preserve-3d',
            transform: `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transition: isDragging.current ? 'none' : 'transform 0.3s ease',
            marginTop: `${buildingHeight * 0.3}px`,
          }}>
            {/* Ground shadow */}
            <div style={{
              position: 'absolute', bottom: 0, left: '50%',
              transform: 'translateX(-50%) translateY(8px) rotateX(90deg)',
              width: `${BASE_W + 60}px`, height: `${BASE_D + 20}px`,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(0,0,0,0.7) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            {/* Ground plate */}
            <div style={{
              position: 'absolute',
              width: `${BASE_W + 30}px`, height: `${BASE_D + 30}px`,
              background: 'linear-gradient(135deg, #0d1a20, #0a1218)',
              border: '1px solid rgba(6,182,212,0.18)',
              bottom: '-6px', left: '-15px',
              transformStyle: 'preserve-3d',
              transform: `rotateX(-90deg) translateZ(6px)`,
              boxShadow: 'inset 0 0 40px rgba(6,182,212,0.06)',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `linear-gradient(rgba(6,182,212,0.07) 1px, transparent 1px),linear-gradient(90deg, rgba(6,182,212,0.07) 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
              }} />
            </div>

            {/* Building floors */}
            <div style={{
              position: 'relative', width: `${BASE_W}px`, height: `${buildingHeight}px`,
              transformStyle: 'preserve-3d',
            }}>
              {[...floors].map(floor => (
                <FloorBlock
                  key={floor.id}
                  floor={floor}
                  index={floor.number - 1}
                  totalFloors={totalFloors}
                  shape={shape}
                  showLabels={showLabels}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Labelled toolbar ── */}
      <div style={{
        position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: '0.25rem',
        background: 'rgba(13,13,20,0.92)', border: '1px solid var(--border-subtle)',
        borderRadius: '16px', padding: '0.6rem 0.85rem', backdropFilter: 'blur(16px)',
        alignItems: 'flex-end',
      }}>
        <ToolBtn icon={<RotateCcw size={15} />} label="Reset" onClick={handleReset} />
        <ToolBtn icon={<ZoomIn size={15} />} label="Zoom In" onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))} />
        <ToolBtn icon={<Plus size={18} />} label="Add Floor" accent loading={adding} onClick={handleAddFloor} />
        <ToolBtn icon={<ZoomOut size={15} />} label="Zoom Out" onClick={() => setZoom(z => Math.max(z - 0.15, 0.3))} />
        <ToolBtn
          icon={showLabels ? <Eye size={15} /> : <EyeOff size={15} />}
          label="Labels" onClick={() => setShowLabels(v => !v)} active={showLabels}
        />
        <ToolBtn icon={<Layers size={15} />} label="Layers" onClick={() => {}} />
      </div>
    </div>
  );
}

/* ── Labelled toolbar button ── */
function ToolBtn({ icon, label, onClick, accent, active, loading }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  accent?: boolean; active?: boolean; loading?: boolean;
}) {
  return (
    <button
      title={label} onClick={onClick} disabled={loading}
      style={{
        minWidth: '52px', padding: '0.4rem 0.4rem 0.3rem', borderRadius: '10px',
        background: accent ? 'linear-gradient(135deg,#ec4899,#f97316)' : active ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
        border: accent ? 'none' : active ? '1px solid rgba(6,182,212,0.3)' : '1px solid transparent',
        color: accent ? '#fff' : active ? '#06b6d4' : 'var(--text-secondary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
        cursor: loading ? 'wait' : 'pointer', transition: 'all 0.15s', opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? <span style={{ fontSize: '0.7rem' }}>...</span> : icon}
      <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

/* ── Empty state ── */
function EmptyState({ onAddFloor, adding }: { onAddFloor: () => void; adding: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: 'var(--text-tertiary)' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '16px', border: '2px dashed var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Layers size={32} color="var(--text-tertiary)" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>No floors yet</div>
        <div style={{ fontSize: '0.75rem' }}>Ask the AI to add a floor or click below</div>
      </div>
      <button
        onClick={onAddFloor} disabled={adding}
        style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: adding ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <Plus size={14} />
        {adding ? 'Adding...' : 'Add First Floor'}
      </button>
    </div>
  );
}
