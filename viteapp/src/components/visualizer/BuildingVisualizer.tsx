import { useState, useRef, useCallback } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Plus, Eye, EyeOff, Layers } from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import { sendMessage } from '../../services/api';
import { RiskToast } from '../shared/RiskToast';
import type { Floor, Room } from '../../context/BuildingContext';

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
const roomMeta = (room: Room) => ROOM_META[room.type] ?? ROOM_META['general'];

/* ── Building geometry ── */
const BASE_W = 260;
const BASE_D = 190;
const FLOOR_H = 64;
const ROOF_H = 10;
const SILL_H = 14;      // solid band at the bottom of each façade
const LINTEL_H = 6;     // solid band at the top of each façade (slab edge)
const DOOR_W = 14;
const EXPLODE_GAP = 48; // vertical gap between floors in exploded view
const EPS = 0.5;

/* ── Satellite ground ── */
const GROUND_W = BASE_W * 3;
const GROUND_D = BASE_D * 3;
const PLOT_W = BASE_W + 60;
const PLOT_D = BASE_D + 60;
const ROAD_TOP = (GROUND_D + PLOT_D) / 2 + 12;
const ROAD_H = 16;

interface TreeSpot { x: number; y: number; r: number }
const TREE_SPOTS: TreeSpot[] = (() => {
  const spots: TreeSpot[] = [];
  const cx = GROUND_W / 2;
  const cy = GROUND_D / 2;
  let attempts = 0;
  while (spots.length < 16 && attempts < 300) {
    attempts++;
    const x = Math.random() * GROUND_W;
    const y = Math.random() * GROUND_D;
    if (Math.abs(x - cx) < PLOT_W / 2 + 8 && Math.abs(y - cy) < PLOT_D / 2 + 8) continue;
    if (y > ROAD_TOP - 12 && y < ROAD_TOP + ROAD_H + 12) continue;
    spots.push({ x, y, r: 8 + Math.random() * 10 });
  }
  return spots;
})();

/* ── 3D plane helpers ──
   World space: x → right, y → down (ground at y=0, floors stack into −y),
   z → towards the viewer. Every plane is anchored by its top-left corner. */
const plane = (w: number, h: number, transform: string): React.CSSProperties => ({
  position: 'absolute', left: 0, top: 0,
  width: `${w}px`, height: `${h}px`,
  transformOrigin: '0 0', transform, boxSizing: 'border-box',
});
/** Horizontal plane at height y covering x∈[x, x+w], z∈[z, z+d]. */
const flat = (x: number, y: number, z: number, w: number, d: number) =>
  plane(w, d, `translate3d(${x}px,${y}px,${z}px) rotateX(90deg)`);
/** Vertical wall in the plane z=const, running along +x. */
const wallX = (x: number, yTop: number, z: number, len: number, h: number) =>
  plane(len, h, `translate3d(${x}px,${yTop}px,${z}px)`);
/** Vertical wall in the plane x=const, running along +z. */
const wallZ = (x: number, yTop: number, z: number, len: number, h: number) =>
  plane(len, h, `translate3d(${x}px,${yTop}px,${z}px) rotateY(-90deg)`);

/* ── Floor-plan layout: area-weighted binary partition (treemap) ── */
interface RoomRect { room: Room; x: number; z: number; w: number; d: number }

function partition(rooms: Room[], x: number, z: number, w: number, d: number): RoomRect[] {
  if (rooms.length === 0) return [];
  if (rooms.length === 1) return [{ room: rooms[0], x, z, w, d }];

  const areas = rooms.map(r => Math.max(r.area_sqft || 0, 40));
  const total = areas.reduce((a, b) => a + b, 0);
  let acc = 0, split = 1, bestDiff = Infinity;
  for (let i = 1; i < rooms.length; i++) {
    acc += areas[i - 1];
    const diff = Math.abs(acc - total / 2);
    if (diff < bestDiff) { bestDiff = diff; split = i; }
  }
  const ratio = areas.slice(0, split).reduce((a, b) => a + b, 0) / total;
  const first = rooms.slice(0, split);
  const rest = rooms.slice(split);

  if (w >= d) {
    const w1 = w * ratio;
    return [...partition(first, x, z, w1, d), ...partition(rest, x + w1, z, w - w1, d)];
  }
  const d1 = d * ratio;
  return [...partition(first, x, z, w, d1), ...partition(rest, x, z + d1, w, d - d1)];
}

function layoutRooms(rooms: Room[], W: number, D: number): RoomRect[] {
  const sorted = [...rooms].sort((a, b) => (b.area_sqft || 0) - (a.area_sqft || 0));
  return partition(sorted, 0, 0, W, D);
}

/** Interior partitions: each rect's right / front edge, unless it is on the exterior. */
function interiorWalls(rects: RoomRect[], W: number, D: number) {
  const walls: { axis: 'x' | 'z'; x: number; z: number; len: number }[] = [];
  for (const r of rects) {
    if (r.x + r.w < W - EPS) walls.push({ axis: 'z', x: r.x + r.w, z: r.z, len: r.d });
    if (r.z + r.d < D - EPS) walls.push({ axis: 'x', x: r.x, z: r.z + r.d, len: r.w });
  }
  return walls;
}

/* ── Façades ── each maps the rooms touching it to [start, end] spans in the
   wall's own left-to-right coordinate (as seen from outside). */
type FacadeKey = 'front' | 'right' | 'back' | 'left';
interface Span { room: Room; start: number; end: number }

function facadeSpans(rects: RoomRect[], key: FacadeKey, W: number, D: number): Span[] {
  const spans: Span[] = [];
  for (const r of rects) {
    if (key === 'front' && Math.abs(r.z + r.d - D) < EPS) spans.push({ room: r.room, start: r.x, end: r.x + r.w });
    if (key === 'back' && r.z < EPS) spans.push({ room: r.room, start: W - r.x - r.w, end: W - r.x });
    if (key === 'left' && r.x < EPS) spans.push({ room: r.room, start: r.z, end: r.z + r.d });
    if (key === 'right' && Math.abs(r.x + r.w - W) < EPS) spans.push({ room: r.room, start: D - r.z - r.d, end: D - r.z });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Where the main entrance goes on the ground-floor front façade (x position of the door centre). */
function entranceX(rects: RoomRect[], W: number, D: number): number {
  const spans = facadeSpans(rects, 'front', W, D);
  if (spans.length === 0) return W / 2;
  const hall = spans.find(s => s.room.type === 'hallway');
  const pick = hall ?? spans.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return (pick.start + pick.end) / 2;
}

const floorScale = (shape: string, index: number) => (shape === 'pyramid' ? Math.pow(0.82, index) : 1);

/* ── Façade wall: solid sill + lintel, one glazed bay per room behind it ── */
function Facade({ facade, W, D, H, spans, colors, light, children }: {
  facade: FacadeKey; W: number; D: number; H: number; spans: Span[];
  colors: ReturnType<typeof pc>; light: number; children?: React.ReactNode;
}) {
  const len = facade === 'front' || facade === 'back' ? W : D;
  const transform = {
    front: `translate3d(0px,${-H}px,${D}px)`,
    right: `translate3d(${W}px,${-H}px,${D}px) rotateY(90deg)`,
    back:  `translate3d(${W}px,${-H}px,0px) rotateY(180deg)`,
    left:  `translate3d(0px,${-H}px,0px) rotateY(-90deg)`,
  }[facade];
  const bays = spans.length > 0 ? spans : [{ room: null, start: 0, end: len }];

  return (
    <div style={{
      ...plane(len, H, transform),
      background: `linear-gradient(180deg, ${colors.top} 0 ${LINTEL_H}px, transparent ${LINTEL_H}px calc(100% - ${SILL_H}px), ${colors.front} calc(100% - ${SILL_H}px))`,
      borderLeft: `2px solid ${colors.side}`,
      borderRight: `2px solid ${colors.side}`,
      filter: `brightness(${light})`,
    }}>
      {bays.map((b, i) => {
        const tint = b.room ? roomMeta(b.room).color : colors.label;
        return (
          <div key={b.room?.id ?? i} style={{
            position: 'absolute', top: `${LINTEL_H}px`, bottom: `${SILL_H}px`,
            left: `${b.start}px`, width: `${b.end - b.start}px`,
            background: `linear-gradient(160deg, ${tint}38, ${tint}12 60%, ${tint}26)`,
            borderLeft: `2px solid ${colors.side}`, borderRight: `2px solid ${colors.side}`,
            boxSizing: 'border-box',
          }}>
            {/* transom */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: '30%', height: '1px', background: `${tint}70` }} />
          </div>
        );
      })}
      {children}
    </div>
  );
}

/* ── Interior partition with a doorway cut into it ── */
function Partition({ len, H }: { len: number; H: number }) {
  const wall: React.CSSProperties = {
    position: 'absolute',
    background: 'linear-gradient(180deg, rgba(226,232,240,0.62), rgba(148,163,184,0.5))',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
  };
  if (len < DOOR_W * 2.2) return <div style={{ ...wall, inset: 0 }} />;
  const doorL = (len - DOOR_W) / 2;
  const doorH = H * 0.62;
  return (
    <>
      <div style={{ ...wall, left: 0, top: 0, bottom: 0, width: `${doorL}px` }} />
      <div style={{ ...wall, right: 0, top: 0, bottom: 0, width: `${doorL}px` }} />
      <div style={{ ...wall, left: `${doorL}px`, width: `${DOOR_W}px`, top: 0, height: `${H - doorH}px` }} />
    </>
  );
}

interface FloorBlockProps {
  floor: Floor;
  index: number;
  shape: string;
  showLabels: boolean;
  y: number;        // world y of this floor's slab
  rotX: number;
  rotY: number;
}

function FloorBlock({ floor, index, shape, showLabels, y, rotX, rotY }: FloorBlockProps) {
  const colors = pc(index);
  const scale = floorScale(shape, index);
  const W = BASE_W * scale;
  const D = BASE_D * scale;
  const H = FLOOR_H;
  const rects = layoutRooms(floor.rooms, W, D);
  const partitions = interiorWalls(rects, W, D);
  const doorX = index === 0 ? entranceX(rects, W, D) : null;

  return (
    <div style={{
      position: 'absolute', left: 0, top: 0,
      transformStyle: 'preserve-3d', transformOrigin: '0 0',
      transform: `translate3d(${(BASE_W - W) / 2}px,${y}px,${(BASE_D - D) / 2}px)`,
      transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* Floor slab */}
      <div style={{
        ...flat(0, 0, 0, W, D),
        background: `linear-gradient(135deg, #39424d, #222830)`,
        border: `2px solid ${colors.top}`,
      }} />

      {/* Room floors — area-proportional plan */}
      {rects.map(r => {
        const meta = roomMeta(r.room);
        return (
          <div key={r.room.id} title={`${r.room.name} · ${r.room.type} · ${r.room.area_sqft} sqft`} style={{
            ...flat(r.x + 2, -0.6, r.z + 2, Math.max(r.w - 4, 1), Math.max(r.d - 4, 1)),
            background: `repeating-linear-gradient(45deg, ${meta.color}2a 0 6px, ${meta.color}1a 6px 12px)`,
            border: `1px solid ${meta.color}90`,
            borderRadius: '2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: `${Math.min(18, Math.min(r.w, r.d) * 0.35)}px`, opacity: 0.55 }}>{meta.symbol}</span>
          </div>
        );
      })}

      {/* Interior partitions */}
      {partitions.map((p, i) => (
        <div key={i} style={p.axis === 'x' ? wallX(p.x, -H, p.z, p.len, H) : wallZ(p.x, -H, p.z, p.len, H)}>
          <Partition len={p.len} H={H} />
        </div>
      ))}

      {/* Exterior façades */}
      <Facade facade="back" W={W} D={D} H={H} spans={facadeSpans(rects, 'back', W, D)} colors={colors} light={0.6} />
      <Facade facade="left" W={W} D={D} H={H} spans={facadeSpans(rects, 'left', W, D)} colors={colors} light={0.7} />
      <Facade facade="right" W={W} D={D} H={H} spans={facadeSpans(rects, 'right', W, D)} colors={colors} light={0.85} />
      <Facade facade="front" W={W} D={D} H={H} spans={facadeSpans(rects, 'front', W, D)} colors={colors} light={1}>
        {showLabels && (
          <span style={{
            position: 'absolute', bottom: '3px', left: '8px',
            fontSize: '0.45rem', fontWeight: 800, letterSpacing: '0.12em', lineHeight: 1,
            color: colors.label, textShadow: `0 0 6px ${colors.label}80`, whiteSpace: 'nowrap',
          }}>
            FLOOR {String(floor.number).padStart(2, '0')} · {floor.rooms.length} {floor.rooms.length === 1 ? 'ROOM' : 'ROOMS'}
          </span>
        )}
        {doorX !== null && (
          <div style={{
            position: 'absolute', bottom: 0, left: `${doorX - 10}px`, width: '20px', height: `${H * 0.62}px`,
            background: 'linear-gradient(180deg, #6b4423, #432910)',
            border: '1px solid #2a1a0a', borderRadius: '2px 2px 0 0',
          }}>
            <div style={{ position: 'absolute', right: '3px', top: '50%', width: '3px', height: '3px', borderRadius: '50%', background: '#d4a86a' }} />
          </div>
        )}
      </Facade>

      {/* Room labels — billboards that always face the camera */}
      {showLabels && rects.map(r => {
        const meta = roomMeta(r.room);
        return (
          <div key={`lbl-${r.room.id}`} style={{
            position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', pointerEvents: 'none',
            transform: `translate3d(${r.x + r.w / 2}px,${-H * 0.45}px,${r.z + r.d / 2}px) rotateY(${-rotY}deg) rotateX(${-rotX}deg) translate(-50%,-50%)`,
            background: 'rgba(10,14,22,0.82)',
            borderLeft: `2px solid ${meta.color}`,
            borderRadius: '3px', padding: '2px 4px',
            whiteSpace: 'nowrap', lineHeight: 1.15,
          }}>
            <div style={{ fontSize: '7px', fontWeight: 700, color: '#e2e8f0', maxWidth: `${Math.max(r.w, 40)}px`, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.symbol} {r.room.name}
            </div>
            <div style={{ fontSize: '6px', fontWeight: 600, color: meta.color, letterSpacing: '0.05em' }}>
              {meta.label} · {r.room.area_sqft} SQFT
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Roof terrace with parapet, sitting on the top floor ── */
function RoofCap({ totalFloors, shape, y }: { totalFloors: number; shape: string; y: number }) {
  const scale = floorScale(shape, totalFloors - 1);
  const W = BASE_W * scale;
  const D = BASE_D * scale;
  const parapet = (light: number): React.CSSProperties => ({
    background: 'linear-gradient(180deg, #6b747e, #3f464d)',
    border: '1px solid rgba(0,0,0,0.3)',
    filter: `brightness(${light})`,
  });

  return (
    <div style={{
      position: 'absolute', left: 0, top: 0,
      transformStyle: 'preserve-3d', transformOrigin: '0 0',
      transform: `translate3d(${(BASE_W - W) / 2}px,${y}px,${(BASE_D - D) / 2}px)`,
      transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <div style={{
        ...flat(0, 0, 0, W, D),
        background: 'linear-gradient(135deg, #8a94a0, #5c6670)',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: 'inset 0 0 16px rgba(0,0,0,0.3)',
      }}>
        <div style={{ position: 'absolute', inset: '6px', border: '1px dashed rgba(255,255,255,0.22)' }} />
      </div>
      <div style={{ ...wallX(0, -ROOF_H, D, W, ROOF_H), ...parapet(1) }} />
      <div style={{ ...wallX(0, -ROOF_H, 0, W, ROOF_H), ...parapet(0.6) }} />
      <div style={{ ...wallZ(0, -ROOF_H, 0, D, ROOF_H), ...parapet(0.7) }} />
      <div style={{ ...wallZ(W, -ROOF_H, 0, D, ROOF_H), ...parapet(0.85) }} />
    </div>
  );
}

/* ── Main component ── */
export function BuildingVisualizer() {
  const { state, dispatch } = useBuilding();
  const [zoom, setZoom] = useState(0.9);
  const [showLabels, setShowLabels] = useState(true);
  const [exploded, setExploded] = useState(false);
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

  const floors = [...state.floors].sort((a, b) => a.number - b.number);
  const totalFloors = floors.length;
  const shape = state.constraints?.shape || 'rectangle';

  const handleAddFloor = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await sendMessage('add a floor');
      if (res.updatedState) dispatch({ type: 'SET_STATE', payload: res.updatedState });
      if (res.structuralRisk !== undefined) dispatch({ type: 'SET_RISK', payload: res.structuralRisk });
    } catch { /* ignore */ }
    finally { setAdding(false); }
  };

  const handleReset = async () => {
    try {
      const res = await sendMessage('reset building');
      if (res.updatedState) dispatch({ type: 'SET_STATE', payload: res.updatedState });
      if (res.structuralRisk !== undefined) dispatch({ type: 'SET_RISK', payload: res.structuralRisk });
    } catch { /* ignore */ }
  };

  const displayRotY = Math.round(((rotY % 360) + 360) % 360);
  const displayRotX = Math.round(rotX);
  const gap = exploded ? EXPLODE_GAP : 0;
  const floorY = (index: number) => -index * (FLOOR_H + gap);
  const buildingHeight = totalFloors * FLOOR_H + Math.max(0, totalFloors - 1) * gap + (exploded ? 0 : ROOF_H);
  const doorX = totalFloors > 0 ? entranceX(layoutRooms(floors[0].rooms, BASE_W, BASE_D), BASE_W, BASE_D) : BASE_W / 2;

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
        <span style={{ color: '#a3e635' }}>VIEW: {exploded ? 'EXPLODED' : 'STACKED'}</span>
        <span style={{ marginLeft: 'auto' }}>FPS: {fps}</span>
      </div>

      {/* ── Main canvas ── */}
      <div
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isDragging.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          perspective: '1400px',
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

        {/* ML structural-risk badge — top-right open area */}
        <RiskToast />

        {/* Drag hint */}
        {totalFloors > 0 && (
          <div style={{
            position: 'absolute', bottom: '1.75rem', right: '1rem',
            fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--text-tertiary)',
            fontWeight: 600, pointerEvents: 'none',
          }}>
            DRAG TO ROTATE • 360°
          </div>
        )}

        {/* Room legend */}
        {totalFloors > 0 && showLabels && (
          <div style={{
            position: 'absolute', top: '0.75rem', left: '1rem',
            display: 'flex', flexDirection: 'column', gap: '0.3rem',
            background: 'rgba(13,13,20,0.75)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '0.5rem 0.65rem', pointerEvents: 'none',
          }}>
            {Object.entries(ROOM_META).map(([type, meta]) => (
              <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: `${meta.color}55`, border: `1px solid ${meta.color}` }} />
                {type.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {totalFloors === 0 ? (
          <EmptyState onAddFloor={handleAddFloor} adding={adding} />
        ) : (
          <div style={{
            position: 'relative', width: 0, height: 0,
            transformStyle: 'preserve-3d',
            transform: `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transition: isDragging.current ? 'none' : 'transform 0.3s ease',
          }}>
            {/* World origin: building footprint corner at ground level, centred on the pivot */}
            <div style={{
              position: 'absolute', left: 0, top: 0,
              transformStyle: 'preserve-3d', transformOrigin: '0 0',
              transform: `translate3d(${-BASE_W / 2}px,${buildingHeight / 2}px,${-BASE_D / 2}px)`,
              transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              {/* Satellite-style ground */}
              <div style={{
                ...flat((BASE_W - GROUND_W) / 2, 1, (BASE_D - GROUND_D) / 2, GROUND_W, GROUND_D),
                background: `
                  radial-gradient(circle at 28% 36%, rgba(94,122,66,0.55) 0%, transparent 32%),
                  radial-gradient(circle at 72% 62%, rgba(74,100,56,0.5) 0%, transparent 28%),
                  radial-gradient(circle at 48% 18%, rgba(112,104,74,0.32) 0%, transparent 38%),
                  radial-gradient(circle at 15% 80%, rgba(84,110,64,0.4) 0%, transparent 30%),
                  linear-gradient(135deg, #3c4c30, #293523)
                `,
                boxShadow: 'inset 0 0 70px rgba(0,0,0,0.45)',
                overflow: 'hidden',
              }}>
                {/* Faint satellite grid / plot lines */}
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                  backgroundSize: '26px 26px',
                }} />
                {/* Highlight glow — spotlights the house against the terrain */}
                <div style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: `${BASE_W + 200}px`, height: `${BASE_D + 160}px`,
                  transform: 'translate(-50%,-50%)', borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(6,182,212,0.35) 0%, rgba(124,58,237,0.16) 42%, transparent 72%)',
                  animation: 'houseGlowPulse 3.5s ease-in-out infinite',
                }} />
                {/* Contact shadow directly under the house */}
                <div style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: `${BASE_W + 50}px`, height: `${BASE_D + 40}px`,
                  transform: 'translate(-50%,-50%)', borderRadius: '12%',
                  background: 'radial-gradient(ellipse, rgba(0,0,0,0.7) 0%, transparent 72%)',
                }} />
                {/* Road running past the front of the plot */}
                <div style={{
                  position: 'absolute', left: 0, top: `${ROAD_TOP}px`, width: '100%', height: `${ROAD_H}px`,
                  background: 'linear-gradient(90deg, rgba(55,55,55,0.85), rgba(88,88,88,0.92), rgba(55,55,55,0.85))',
                  boxShadow: '0 0 8px rgba(0,0,0,0.5)',
                }}>
                  <div style={{
                    position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px',
                    background: 'repeating-linear-gradient(90deg, rgba(255,220,120,0.65) 0 8px, transparent 8px 16px)',
                  }} />
                </div>
                {/* Footpath from the entrance to the road */}
                <div style={{
                  position: 'absolute',
                  left: `${(GROUND_W - BASE_W) / 2 + doorX - 8}px`, width: '16px',
                  top: `${(GROUND_D + BASE_D) / 2}px`, height: `${ROAD_TOP - (GROUND_D + BASE_D) / 2}px`,
                  background: 'repeating-linear-gradient(180deg, #a8a29e 0 6px, #8a8480 6px 7px)',
                  opacity: 0.85,
                }} />
                {/* Scattered vegetation */}
                {TREE_SPOTS.map((t, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${t.x}px`, top: `${t.y}px`,
                    width: `${t.r}px`, height: `${t.r}px`, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #5a8a3a, #1f3a16)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    transform: 'translate(-50%,-50%)',
                  }} />
                ))}
                {/* Plot boundary around the house */}
                <div style={{
                  position: 'absolute',
                  left: `${(GROUND_W - PLOT_W) / 2}px`, top: `${(GROUND_D - PLOT_D) / 2}px`,
                  width: `${PLOT_W}px`, height: `${PLOT_D}px`,
                  border: '1px dashed rgba(255,255,255,0.3)',
                }} />
              </div>

              {/* Building floors */}
              {floors.map(floor => (
                <FloorBlock
                  key={floor.id}
                  floor={floor}
                  index={floor.number - 1}
                  shape={shape}
                  showLabels={showLabels}
                  y={floorY(floor.number - 1)}
                  rotX={rotX}
                  rotY={rotY}
                />
              ))}
              {!exploded && <RoofCap totalFloors={totalFloors} shape={shape} y={floorY(totalFloors)} />}
            </div>
          </div>
        )}

        <style>{`@keyframes houseGlowPulse { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }`}</style>
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
        <ToolBtn icon={<Layers size={15} />} label="Explode" onClick={() => setExploded(v => !v)} active={exploded} />
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
