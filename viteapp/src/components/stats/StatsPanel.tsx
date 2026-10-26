import { TrendingUp, TrendingDown } from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import { formatCurrency, formatPercent, buildingHealthScore } from '../../utils/formatters';

const FLOOR_AREA_SQFT = 4740;

const COST_CATEGORIES = [
  { label: 'STRUCTURAL', color: '#ef4444', key: 'structural' as const },
  { label: 'MECHANICAL', color: '#06b6d4', key: 'mechanical' as const },
  { label: 'FINISHES',   color: '#10b981', key: 'finishes' as const },
];

function DonutChart({ segments }: { segments: { color: string; pct: number }[] }) {
  const R = 56;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {/* Track */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
      {segments.map((seg, i) => {
        const dash = (seg.pct / 100) * circumference;
        const gap = circumference - dash;
        const rotation = (offset / 100) * 360 - 90;
        offset += seg.pct;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rotation} ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        );
      })}
    </svg>
  );
}

export function StatsPanel() {
  const { state } = useBuilding();
  const { floors, budget } = state;

  const totalFloors = floors.length;
  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalAreaSqFt = totalFloors * FLOOR_AREA_SQFT;
  const healthScore = buildingHealthScore(floors);
  const budgetUsedPct = formatPercent(budget.used, budget.total);

  /* ── Cost breakdown (derived) ── */
  const costSplit = budget.used > 0
    ? { structural: 45, mechanical: 32, finishes: 23 }
    : { structural: 0, mechanical: 0, finishes: 0 };

  /* ── Area donut segments (equal per floor, up to 6 colors) ── */
  const areaSegments = totalFloors === 0
    ? [{ color: 'rgba(255,255,255,0.08)', pct: 100 }]
    : floors.map((_, i) => ({
        color: [
          '#ef4444', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
          '#14b8a6', '#f97316', '#6366f1', '#a855f7',
        ][i % 10],
        pct: 100 / totalFloors,
      }));

  const efficiencyGain = healthScore > 0 ? (healthScore * 0.15).toFixed(1) : '0.0';
  const efficiencyPositive = healthScore > 50;

  return (
    <div style={{
      width: '300px',
      minWidth: '260px',
      background: '#0d0d14',
      borderLeft: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem 0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}>

        {/* ── Remaining Budget ── */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.35rem' }}>
            REMAINING BUDGET
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
            {formatCurrency(budget.remaining)}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginTop: '0.4rem',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: efficiencyPositive ? '#10b981' : '#f59e0b',
          }}>
            {efficiencyPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {efficiencyGain}% EFFICIENCY GAIN
          </div>

          {/* Budget bar */}
          <div style={{
            marginTop: '0.5rem',
            height: '4px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${budgetUsedPct}%`,
              background: budgetUsedPct > 80
                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                : 'linear-gradient(90deg, #7c3aed, #06b6d4)',
              borderRadius: '2px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
            {budgetUsedPct}% used • {formatCurrency(budget.used)} spent
          </div>
        </div>

        <Divider />

        {/* ── Floors / Rooms ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <StatCard label="TOTAL FLOORS" value={totalFloors} />
          <StatCard label="TOTAL ROOMS" value={totalRooms} />
        </div>

        <Divider />

        {/* ── Area by floor ── */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
            AREA BY FLOOR
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <DonutChart segments={areaSegments} />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f1f5f9' }}>
                {totalAreaSqFt > 0 ? `${(totalAreaSqFt / 1000).toFixed(1)}k` : '0'}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-tertiary)', letterSpacing: '0.1em' }}>SQ FT</div>
            </div>
          </div>

          {/* Floor legend */}
          {totalFloors > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
              {floors.map((floor, i) => (
                <div key={floor.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '2px',
                    background: areaSegments[i]?.color ?? '#666',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>Floor {floor.number}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{FLOOR_AREA_SQFT.toLocaleString()} ft²</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* ── Cost breakdown ── */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
            COST BREAKDOWN
          </div>
          {COST_CATEGORIES.map(cat => (
            <div key={cat.key} style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color }} />
                  {cat.label}
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {costSplit[cat.key]}%
                </span>
              </div>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: budget.used > 0 ? `${costSplit[cat.key]}%` : '0%',
                  background: cat.color,
                  borderRadius: '2px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        <Divider />

        {/* ── Cost by department ── */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.6rem' }}>
            COST BY DEPARTMENT
          </div>
          {[
            { dept: 'Architecture',  share: 35, color: '#7c3aed' },
            { dept: 'Engineering',   share: 28, color: '#06b6d4' },
            { dept: 'Construction',  share: 22, color: '#10b981' },
            { dept: 'Interior',      share: 15, color: '#f59e0b' },
          ].map(d => (
            <div key={d.dept} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.4rem',
              fontSize: '0.65rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: d.color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{d.dept}</span>
              </div>
              <span style={{ color: 'var(--text-tertiary)' }}>{d.share}%</span>
            </div>
          ))}
        </div>

        {/* ── Health Score ── */}
        <div style={{
          background: 'rgba(16,185,129,0.06)',
          border: '1px solid rgba(16,185,129,0.15)',
          borderRadius: '8px',
          padding: '0.75rem',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.4rem' }}>
            BUILDING HEALTH
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: healthScore >= 60 ? '#10b981' : healthScore >= 30 ? '#f59e0b' : '#ef4444',
            }}>
              {healthScore}
            </span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>/ 100</span>
          </div>
          <div style={{ marginTop: '0.4rem', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${healthScore}%`,
              background: healthScore >= 60 ? '#10b981' : healthScore >= 30 ? '#f59e0b' : '#ef4444',
              borderRadius: '2px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      padding: '0.75rem',
    }}>
      <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0 -0.85rem' }} />;
}
