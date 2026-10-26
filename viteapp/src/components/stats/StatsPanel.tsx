import { TrendingUp, TrendingDown } from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import { formatCurrency, formatPercent, buildingHealthScore } from '../../utils/formatters';
import { LiveConditions } from './LiveConditions';
import { SiteCard } from './SiteCard';
import { BoqCard } from './BoqCard';

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
  const { floors, budget, structuralRisk } = state;

  const totalFloors = floors.length;
  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalAreaSqFt = floors.reduce((s, f) => s + f.area_sqft, 0);
  const healthScore = buildingHealthScore(floors);
  const budgetUsedPct = formatPercent(budget.used, budget.total);

  /* ── Area donut segments (equal per floor, up to 6 colors) ── */
  const areaSegments = totalFloors === 0
    ? [{ color: 'rgba(255,255,255,0.08)', pct: 100 }]
    : floors.map((_f, i) => ({
        color: [
          '#ef4444', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
          '#14b8a6', '#f97316', '#6366f1', '#a855f7',
        ][i % 10],
        pct: totalAreaSqFt > 0 ? (100 * floors[i].area_sqft) / totalAreaSqFt : 100 / totalFloors,
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

        {/* ── ML Structural Risk (moved here from the 3D view) ── */}
        {(() => {
          const r = structuralRisk;
          const color = r === null ? '#64748b' : r >= 0.5 ? '#ef4444' : r >= 0.25 ? '#f59e0b' : '#10b981';
          return (
            <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: '8px', padding: '0.7rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}>ML STRUCTURAL RISK</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color }}>{r === null ? '—' : `${Math.round(r * 100)}%`}</span>
              </div>
              <div style={{ marginTop: '0.4rem', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${r === null ? 0 : Math.round(r * 100)}%`, background: color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                {r === null ? 'Awaiting first assessment — add a floor or room' : `${r >= 0.5 ? 'HIGH' : r >= 0.25 ? 'MODERATE' : 'LOW'} · seismic, soil & wind`}
              </div>
            </div>
          );
        })()}

        <Divider />

        {/* ── Site location ── */}
        <SiteCard />

        <Divider />

        {/* ── Live site conditions ── */}
        <LiveConditions />

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
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {floor.rooms.reduce((s, r) => s + r.area_sqft, 0).toLocaleString()} / {floor.area_sqft.toLocaleString()} ft²
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* ── Cost breakdown: KPWD Schedule of Rates bill of quantities ── */}
        <BoqCard />

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
