import { useState, useRef, useCallback } from 'react';
import { Crown, Check, ArrowLeft, RotateCcw, ZoomIn, ZoomOut, MapPin, Wind, Zap, Thermometer, Activity, ShieldCheck } from 'lucide-react';
import { KARNATAKA_DISTRICTS, getDistrictById } from '../../data/karnataka_db';
import type { DistrictData } from '../../data/karnataka_db';

type View = 'pricing' | 'config' | 'result';

/* ── Constants ─────────────────────────────────────────────── */
const REGION_GROUPS = Array.from(
  KARNATAKA_DISTRICTS.reduce((map, d) => {
    if (!map.has(d.region)) map.set(d.region, []);
    map.get(d.region)!.push(d);
    return map;
  }, new Map<string, typeof KARNATAKA_DISTRICTS>())
);

const FREE_FEATURES = [
  'Basic 3D building visualization',
  'AI chat assistant',
  'Up to 3 floors',
  'Standard room types only',
  'Single district (Bengaluru)',
];

const PRO_FEATURES = [
  'Auto-optimal building generation',
  'Full Karnataka engineering database (15 districts)',
  'IS 456 / IS 875 structural compliance',
  'Seismic, thermal, wind & electrical analysis',
  'Cement grade optimizer — cut costs, boost luxury',
  'Unlimited floors & custom room programs',
  'Sustainability & green building score',
  'Export to PDF / DXF',
];

/* ── Cement data by seismic zone ───────────────────────────── */
function getCementData(zone: 'II' | 'III' | 'IV') {
  const data = {
    'II':  { grade: 'M20', opc: 'OPC 43', impurityPct: 30, impurityType: 'Fly Ash (Class F)', notes: 'Low seismic demand — maximum SCM substitution allowed' },
    'III': { grade: 'M25', opc: 'OPC 43 / 53', impurityPct: 20, impurityType: 'Fly Ash / GGBS', notes: 'Moderate zone — controlled SCM to maintain strength' },
    'IV':  { grade: 'M30', opc: 'OPC 53', impurityPct: 15, impurityType: 'GGBS (Premium)', notes: 'High seismic demand — minimum SCM, premium binder required' },
  };
  return data[zone];
}

/* ── Building auto-generator ───────────────────────────────── */
const ROOM_SEQUENCE = ['bedroom', 'bedroom', 'bathroom', 'kitchen', 'hallway', 'bedroom', 'office', 'bathroom'];

function generateBuilding(budgetLakhs: number, sqft: number) {
  const costPerFloor = (sqft * 3200) / 100_000; // ₹3200/sqft → lakhs
  const floors = Math.max(1, Math.min(10, Math.floor((budgetLakhs * 0.65) / costPerFloor)));
  const roomsPerFloor = Math.max(2, Math.floor(sqft / 130));
  return Array.from({ length: floors }, (_, i) => ({
    number: i + 1,
    rooms: Array.from({ length: roomsPerFloor }, (_, j) => ({
      type: ROOM_SEQUENCE[(j + i) % ROOM_SEQUENCE.length],
    })),
  }));
}

function computeScores(d: DistrictData) {
  return {
    structural:    Math.min(100, Math.round(100 - (d.seismic.peakGroundAcceleration - 0.10) * 500)),
    thermal:       Math.round(100 - d.thermal.thermalComfortIndex * 5.5),
    wind:          Math.round(100 - d.wind.structuralWindIndex * 6),
    grid:          Math.round(d.electrical.gridReliabilityPct),
    sustainability: Math.round(d.electrical.renewableMixPct * 0.6 + (100 - d.thermal.thermalComfortIndex * 5) * 0.4),
  };
}

/* ── Inline mini-3D visualizer ─────────────────────────────── */
const PALETTE = [
  { top: '#1e3a5f', front: '#0f2035', side: '#0a1828', label: '#5ba3d4' },
  { top: '#2d3561', front: '#161a3a', side: '#0d1025', label: '#7b8fd4' },
  { top: '#1a4a3a', front: '#0d2e22', side: '#081a14', label: '#4db89a' },
  { top: '#3d2a5e', front: '#21153a', side: '#150d25', label: '#9b7bd4' },
  { top: '#4a2a1a', front: '#2e1508', side: '#1c0d04', label: '#d49a5a' },
  { top: '#1a3a4a', front: '#0d2230', side: '#081418', label: '#5ab8d4' },
  { top: '#3a1a3a', front: '#220d22', side: '#150815', label: '#d47bd4' },
  { top: '#2a3a1a', front: '#152208', side: '#0d1504', label: '#9ad45a' },
];
const pc = (i: number) => PALETTE[i % PALETTE.length];

const ROOM_DOT: Record<string, string> = {
  bedroom: '#5ba3d4', bathroom: '#60a5fa', kitchen: '#fbbf24',
  hallway: '#a3e635', office: '#c084fc', general: '#94a3b8',
};

const BASE_W = 200; const BASE_D = 140; const FLOOR_H = 56;

function DemoFloor({ floor, shape, showLabels }: {
  floor: { number: number; rooms: { type: string }[] };
  shape: string; showLabels: boolean;
}) {
  const i = floor.number - 1;
  const colors = pc(i);
  const scale = shape === 'pyramid' ? Math.pow(0.83, i) : 1;
  const W = BASE_W * scale; const D = BASE_D * scale;
  const offsetX = (BASE_W - W) / 2;
  const bright = Math.max(0.75, 1 - i * 0.025);

  const face = (bg: string, b: number): React.CSSProperties => ({
    position: 'absolute', background: bg,
    border: `1px solid ${colors.label}18`,
    filter: `brightness(${b})`, boxSizing: 'border-box',
  });

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: `${offsetX}px`,
      width: `${W}px`, height: `${FLOOR_H}px`,
      transformStyle: 'preserve-3d',
      transform: `translateY(${-i * FLOOR_H}px) translateZ(${(BASE_D - D) / 2}px)`,
    }}>
      {/* Top */}
      <div style={{
        ...face(`linear-gradient(135deg,${colors.top},${colors.front}cc)`, bright + 0.2),
        width: `${W}px`, height: `${D}px`,
        transformOrigin: 'top center', transform: 'rotateX(-90deg)', top: 0, left: 0,
      }}>
        <div style={{ position: 'absolute', inset: '5px', display: 'flex', flexWrap: 'wrap', gap: '3px', alignContent: 'flex-start' }}>
          {floor.rooms.map((r, ri) => (
            <div key={ri} style={{ width: '10px', height: '10px', borderRadius: '2px', background: ROOM_DOT[r.type] ?? '#94a3b8', opacity: 0.7 }} />
          ))}
        </div>
      </div>
      {/* Bottom */}
      <div style={{ ...face(colors.front, bright * 0.4), width: `${W}px`, height: `${D}px`, transformOrigin: 'bottom center', transform: 'rotateX(90deg)', bottom: 0, left: 0 }} />
      {/* Front */}
      <div style={{ ...face(`linear-gradient(180deg,${colors.front},${colors.side})`, bright), width: `${W}px`, height: `${FLOOR_H}px`, transform: `translateZ(${D}px)`, top: 0, left: 0 }}>
        <div style={{ position: 'absolute', top: '8px', left: '10px', right: '10px', display: 'flex', gap: '5px' }}>
          {Array.from({ length: Math.min(5, floor.rooms.length + 1) }).map((_, wi) => (
            <div key={wi} style={{ width: '18px', height: '24px', background: `${colors.label}25`, border: `1px solid ${colors.label}35`, borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
        {showLabels && (
          <span style={{ position: 'absolute', bottom: '4px', left: '8px', fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', color: colors.label }}>
            FL {String(floor.number).padStart(2, '0')}
          </span>
        )}
      </div>
      {/* Back */}
      <div style={{ ...face(`linear-gradient(180deg,${colors.side},${colors.front}44)`, bright * 0.6), width: `${W}px`, height: `${FLOOR_H}px`, transform: 'translateZ(0px) rotateY(180deg)', top: 0, left: 0 }} />
      {/* Right */}
      <div style={{ ...face(`${colors.side}ee`, bright * 0.75), width: `${D}px`, height: `${FLOOR_H}px`, transformOrigin: 'left center', transform: 'rotateY(90deg)', top: 0, left: `${W}px` }}>
        <div style={{ position: 'absolute', top: '8px', left: '6px', display: 'flex', gap: '4px' }}>
          {Array.from({ length: 2 }).map((_, wi) => (
            <div key={wi} style={{ width: '12px', height: '18px', background: `${colors.label}20`, border: `1px solid ${colors.label}28`, borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
      </div>
      {/* Left */}
      <div style={{ ...face(`${colors.side}99`, bright * 0.55), width: `${D}px`, height: `${FLOOR_H}px`, transformOrigin: 'right center', transform: 'rotateY(-90deg)', top: 0, left: 0 }} />
    </div>
  );
}

function DemoVisualizer({ floors, shape }: { floors: { number: number; rooms: { type: string }[] }[]; shape: string }) {
  const [zoom, setZoom] = useState(0.85);
  const [rotY, setRotY] = useState(-30);
  const [rotX, setRotX] = useState(-20);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [showLabels] = useState(true);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setRotY(r => r + dx * 0.55);
    setRotX(r => Math.max(-85, Math.min(85, r - dy * 0.38)));
  }, []);
  const stopDrag = useCallback(() => { isDragging.current = false; }, []);

  const buildingH = floors.length * FLOOR_H;

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onMouseMove={onMouseMove} onMouseUp={stopDrag} onMouseLeave={stopDrag}>
      {/* Toolbar */}
      <div style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', gap: '0.3rem', background: 'rgba(8,8,16,0.9)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', padding: '0.5rem 0.7rem', backdropFilter: 'blur(12px)' }}>
        {[
          { icon: <ZoomIn size={14} />, label: 'In', action: () => setZoom(z => Math.min(z + 0.15, 2.5)) },
          { icon: <ZoomOut size={14} />, label: 'Out', action: () => setZoom(z => Math.max(z - 0.15, 0.3)) },
          { icon: <RotateCcw size={14} />, label: 'Reset', action: () => { setRotY(-30); setRotX(-20); setZoom(0.85); } },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action} style={{
            padding: '0.35rem 0.6rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', minWidth: '44px',
          }}>
            {icon}
            <span style={{ fontSize: '0.46rem', fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
          </button>
        ))}
      </div>

      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isDragging.current ? 'grabbing' : 'grab', userSelect: 'none', perspective: '1100px',
          position: 'relative', overflow: 'hidden' }}
        onMouseDown={onMouseDown}
      >
        {/* Grid */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.01) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.01) 1px,transparent 1px)',
          backgroundSize: '36px 36px' }} />
        {/* Glow */}
        <div style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(ellipse,rgba(124,58,237,0.06) 0%,transparent 70%)' }} />

        <div style={{ position: 'absolute', top: '0.75rem', right: '1rem', fontSize: '0.55rem',
          letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', fontWeight: 600, pointerEvents: 'none' }}>
          DRAG TO ROTATE
        </div>

        <div style={{
          position: 'relative', transformStyle: 'preserve-3d',
          transform: `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          transition: isDragging.current ? 'none' : 'transform 0.3s ease',
          marginTop: `${buildingH * 0.28}px`,
        }}>
          {/* Shadow */}
          <div style={{ position: 'absolute', bottom: 0, left: '50%',
            transform: 'translateX(-50%) translateY(8px) rotateX(90deg)',
            width: `${BASE_W + 50}px`, height: `${BASE_D + 20}px`, borderRadius: '50%',
            background: 'radial-gradient(ellipse,rgba(0,0,0,0.8) 0%,transparent 70%)', pointerEvents: 'none' }} />
          {/* Ground */}
          <div style={{ position: 'absolute', width: `${BASE_W + 28}px`, height: `${BASE_D + 28}px`,
            background: 'linear-gradient(135deg,#0a1218,#060e14)', border: '1px solid rgba(124,58,237,0.2)',
            bottom: '-5px', left: '-14px', transformStyle: 'preserve-3d',
            transform: 'rotateX(-90deg) translateZ(5px)', boxShadow: 'inset 0 0 30px rgba(124,58,237,0.05)' }}>
            <div style={{ position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(rgba(124,58,237,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.06) 1px,transparent 1px)',
              backgroundSize: '18px 18px' }} />
          </div>
          {/* Floors */}
          <div style={{ position: 'relative', width: `${BASE_W}px`, height: `${buildingH}px`, transformStyle: 'preserve-3d' }}>
            {floors.map(f => <DemoFloor key={f.number} floor={f} shape={shape} showLabels={showLabels} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Score bar ──────────────────────────────────────────────── */
function ScoreBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {icon}{label}
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '2px', transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────── */
export function ModelsPage() {
  const [view, setView] = useState<View>('pricing');
  const [districtId, setDistrictId] = useState('bengaluru-urban');
  const [budgetLakhs, setBudgetLakhs] = useState('60');
  const [sqft, setSqft] = useState('500');
  const [shape, setShape] = useState<'rectangle' | 'square' | 'pyramid'>('rectangle');
  const [result, setResult] = useState<{
    district: DistrictData;
    floors: { number: number; rooms: { type: string }[] }[];
    scores: ReturnType<typeof computeScores>;
    cement: ReturnType<typeof getCementData>;
    cementSavingLakhs: number;
    luxuryBudgetLakhs: number;
    budgetLakhs: number;
    sqft: number;
    shape: string;
  } | null>(null);

  const handleRunDemo = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const district = getDistrictById(districtId)!;
    const budget = parseFloat(budgetLakhs) || 60;
    const area = parseFloat(sqft) || 500;
    const floors = generateBuilding(budget, area);
    const scores = computeScores(district);
    const cement = getCementData(district.seismic.zone);
    const cementBudget = budget * 0.15;
    const savingLakhs = parseFloat((cementBudget * (cement.impurityPct / 100) * 0.48).toFixed(2));
    const luxuryLakhs = parseFloat((savingLakhs * 0.9).toFixed(2));
    setResult({ district, floors, scores, cement, cementSavingLakhs: savingLakhs, luxuryBudgetLakhs: luxuryLakhs, budgetLakhs: budget, sqft: area, shape });
    setView('result');
  };

  /* ── Pricing view ── */
  if (view === 'pricing') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>ARCHI-MIND AI</div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Upgrade to Pro</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Unlock full engineering intelligence for Karnataka building design
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
          {/* Tier cards */}
          <div style={{ display: 'flex', gap: '1.25rem', width: '100%', maxWidth: '860px', alignItems: 'stretch' }}>

            {/* Free */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>CURRENT PLAN</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>Free</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>₹0</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>Forever free</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {FREE_FEATURES.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <Check size={13} color="#10b981" style={{ flexShrink: 0, marginTop: '1px' }} />
                    {f}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.5rem', padding: '0.65rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                Current Plan
              </div>
            </div>

            {/* Pro */}
            <div style={{ flex: 1, background: 'linear-gradient(145deg, rgba(124,58,237,0.1), rgba(6,182,212,0.06))', border: '1px solid rgba(124,58,237,0.4)', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              {/* Glow */}
              <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.2), transparent 70%)', pointerEvents: 'none' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Crown size={14} color="#f59e0b" fill="#f59e0b" />
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: '#f59e0b', fontWeight: 700 }}>RECOMMENDED</div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem', color: '#a78bfa' }}>Pro</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>₹2,499</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>per month · billed annually</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {PRO_FEATURES.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <Check size={13} color="#a78bfa" style={{ flexShrink: 0, marginTop: '1px' }} />
                    {f}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <button
                  onClick={() => setView('config')}
                  style={{ padding: '0.75rem', background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}
                >
                  Try Pro Demo
                </button>
                <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                  No credit card required for demo
                </div>
              </div>
            </div>
          </div>

          {/* Feature highlight strip */}
          <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '860px' }}>
            {[
              { icon: <Activity size={16} color="#ef4444" />, title: 'Seismic Analysis', desc: 'IS 1893-2016 compliance for all Karnataka zones' },
              { icon: <Thermometer size={16} color="#f59e0b" />, title: 'Thermal Model', desc: 'EnergyPlus-calibrated climate zone analysis' },
              { icon: <ShieldCheck size={16} color="#10b981" />, title: 'Cement Optimizer', desc: 'Cut cement cost, redirect savings to luxury finishes' },
              { icon: <Zap size={16} color="#a78bfa" />, title: 'Electrical Load', desc: 'IEEE 37-bus grid reliability per district' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ marginBottom: '0.5rem' }}>{icon}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>{title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Config view ── */
  if (view === 'config') {
    const selected = getDistrictById(districtId);
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
        <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => setView('pricing')} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Pro Demo — Configure Project</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>We will auto-generate the optimal building for your inputs</p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2.5rem 2rem' }}>
          <form onSubmit={handleRunDemo} style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* District */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.45rem', letterSpacing: '0.04em' }}>
                DISTRICT — KARNATAKA
              </label>
              <select
                value={districtId}
                onChange={e => setDistrictId(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                {REGION_GROUPS.map(([region, districts]) => (
                  <optgroup key={region} label={region} style={{ background: '#0d0d14', color: '#64748b' }}>
                    {districts.map(d => (
                      <option key={d.id} value={d.id} style={{ background: '#0d0d14' }}>{d.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selected && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[
                    { icon: <MapPin size={10} />, text: selected.region, color: '#7c3aed' },
                    { icon: <Thermometer size={10} />, text: selected.thermal.climateZone, color: '#f59e0b' },
                    { icon: <Activity size={10} />, text: `Seismic Zone ${selected.seismic.zone}`, color: '#ef4444' },
                    { icon: <Wind size={10} />, text: `Wind ${selected.wind.basicWindSpeed} km/h`, color: '#06b6d4' },
                  ].map(({ icon, text, color }) => (
                    <span key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color, fontWeight: 600, background: `${color}12`, border: `1px solid ${color}25`, borderRadius: '20px', padding: '0.15rem 0.55rem' }}>
                      {icon}{text}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Budget */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.45rem', letterSpacing: '0.04em' }}>
                TOTAL BUDGET — LAKHS (INR)
              </label>
              <input type="number" min="5" max="1000" value={budgetLakhs} onChange={e => setBudgetLakhs(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }} />
              <div style={{ marginTop: '0.35rem', fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>
                Approx. {Math.max(1, Math.min(10, Math.floor((parseFloat(budgetLakhs) * 0.65) / ((parseFloat(sqft) * 3200) / 100000))))} floor(s) at current area
              </div>
            </div>

            {/* Sqft */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.45rem', letterSpacing: '0.04em' }}>
                DEFAULT ROOM AREA — SQ FT
              </label>
              <input type="number" min="100" max="5000" step="50" value={sqft} onChange={e => setSqft(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }} />
            </div>

            {/* Shape */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.45rem', letterSpacing: '0.04em' }}>
                BUILDING SHAPE
              </label>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                {(['rectangle', 'square', 'pyramid'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setShape(s)}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: '10px', border: shape === s ? '1px solid rgba(124,58,237,0.5)' : '1px solid var(--border-subtle)', background: shape === s ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)', color: shape === s ? '#a78bfa' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: shape === s ? 700 : 500, cursor: 'pointer', textTransform: 'capitalize' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" style={{ marginTop: '0.5rem', padding: '0.85rem', background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}>
              Generate Optimal Building
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── Result view ── */
  if (!result) return null;
  const { district, floors, scores, cement, cementSavingLakhs, luxuryBudgetLakhs } = result;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <button onClick={() => setView('config')} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.35rem 0.7rem', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <ArrowLeft size={12} /> Edit
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            Optimal Design — {district.name}
          </h2>
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            {[
              { text: `${floors.length} floors`, color: '#a78bfa' },
              { text: `${result.shape}`, color: '#06b6d4' },
              { text: `₹${result.budgetLakhs}L budget`, color: '#10b981' },
              { text: `${result.sqft} sqft/room`, color: '#f59e0b' },
            ].map(({ text, color }) => (
              <span key={text} style={{ fontSize: '0.65rem', fontWeight: 600, color, background: `${color}12`, border: `1px solid ${color}25`, borderRadius: '20px', padding: '0.1rem 0.5rem' }}>{text}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '20px', padding: '0.25rem 0.75rem' }}>
          <Crown size={12} color="#f59e0b" fill="#f59e0b" />
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a78bfa' }}>PRO DEMO</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 3D Visualizer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', position: 'relative' }}>
          <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '1.5rem', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.07em', color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />RENDER: CSS 3D</span>
            <span style={{ color: '#a78bfa' }}>SHAPE: {result.shape.toUpperCase()}</span>
            <span style={{ color: '#06b6d4' }}>FLOORS: {floors.length}</span>
            <span style={{ color: '#f59e0b' }}>SEISMIC: ZONE {district.seismic.zone}</span>
          </div>
          <DemoVisualizer floors={floors} shape={result.shape} />
        </div>

        {/* Analysis panel */}
        <div style={{ width: '320px', flexShrink: 0, overflowY: 'auto', padding: '1.25rem' }}>

          {/* Performance scores */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontWeight: 700, marginBottom: '0.85rem' }}>PERFORMANCE ANALYSIS</div>
            <ScoreBar label="Structural Safety" value={scores.structural} color="#ef4444" icon={<Activity size={11} />} />
            <ScoreBar label="Thermal Comfort" value={scores.thermal} color="#f59e0b" icon={<Thermometer size={11} />} />
            <ScoreBar label="Wind Resistance" value={scores.wind} color="#06b6d4" icon={<Wind size={11} />} />
            <ScoreBar label="Grid Reliability" value={scores.grid} color="#10b981" icon={<Zap size={11} />} />
            <ScoreBar label="Sustainability" value={scores.sustainability} color="#a78bfa" icon={<ShieldCheck size={11} />} />
          </div>

          {/* Engineering highlights */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontWeight: 700, marginBottom: '0.75rem' }}>DISTRICT FACTORS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {[
                { label: 'Seismic Zone', value: `Zone ${district.seismic.zone} — ${district.seismic.structuralRisk} Risk`, color: '#ef4444' },
                { label: 'Soil Type', value: district.seismic.soilType, color: '#f97316' },
                { label: 'Climate', value: district.thermal.climateZone, color: '#f59e0b' },
                { label: 'Wind Speed', value: `${district.wind.basicWindSpeed} km/h basic`, color: '#06b6d4' },
                { label: 'Grid Uptime', value: `${district.electrical.gridReliabilityPct}%`, color: '#10b981' },
                { label: 'Renewable Mix', value: `${district.electrical.renewableMixPct}%`, color: '#a78bfa' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{label}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cement optimizer */}
          <div style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(6,182,212,0.05))', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: '#a78bfa', fontWeight: 700, marginBottom: '0.75rem' }}>CEMENT GRADE OPTIMIZER</div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.6rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>MIN GRADE REQUIRED</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f1f5f9' }}>{cement.grade}</div>
                <div style={{ fontSize: '0.6rem', color: '#a78bfa' }}>{cement.opc}</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.6rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>SCM ALLOWED</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10b981' }}>{cement.impurityPct}%</div>
                <div style={{ fontSize: '0.6rem', color: '#10b981' }}>{cement.impurityType}</div>
              </div>
            </div>

            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
              {cement.notes}. Replacing {cement.impurityPct}% OPC with SCM reduces binder cost by ~48% on that fraction.
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: '#10b981', marginBottom: '0.15rem', fontWeight: 600 }}>CEMENT SAVED</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>₹{cementSavingLakhs}L</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: '#f59e0b', marginBottom: '0.15rem', fontWeight: 600 }}>LUXURY BUDGET</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>₹{luxuryBudgetLakhs}L</div>
              </div>
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.62rem', color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
              This saving can be redirected to premium flooring, facade cladding, or MEP upgrades without exceeding budget.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
