import { useState } from 'react';
import {
  Play, Pause, RefreshCw, Activity, Thermometer,
  Wind, Zap, AlertTriangle, CheckCircle, MapPin,
} from 'lucide-react';
import { useBuilding } from '../../context/BuildingContext';
import type { DistrictData } from '../../data/karnataka_db';

// ── Types ─────────────────────────────────────────────────────────────────────
type SimStatus = 'ready' | 'running' | 'completed' | 'failed';

const STATUS_CONFIG: Record<SimStatus, { label: string; color: string; bg: string }> = {
  ready:     { label: 'READY',     color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
  running:   { label: 'RUNNING',   color: '#06b6d4', bg: 'rgba(6,182,212,0.08)'   },
  completed: { label: 'COMPLETED', color: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
  failed:    { label: 'FAILED',    color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
};

// ── Derive simulation descriptions from district data ─────────────────────────
interface SimSpec {
  id: string;
  name: string;
  color: string;
  icon: React.ReactNode;
  description: string;
  duration: string;
  metrics: { label: string; value: string; unit: string; risk?: 'low' | 'medium' | 'high' }[];
  passThreshold: (d: DistrictData, floors: number) => boolean;
}

function buildSimSpecs(d: DistrictData, floors: number): SimSpec[] {
  const totalArea = floors * 1200; // sqft per floor estimate

  return [
    {
      id: 'seismic',
      name: 'Seismic Load Analysis',
      color: '#ef4444',
      icon: <Activity size={18} />,
      description: `IS 1893-2016 analysis for ${d.name}. Seismic Zone ${d.seismic.zone} — ${d.seismic.zoneDescription}. Soil class: ${d.seismic.soilType}.`,
      duration: '~45s',
      passThreshold: (dist) => dist.seismic.structuralRisk !== 'High',
      metrics: [
        { label: 'Seismic Zone',             value: `Zone ${d.seismic.zone}`,                          unit: '',     risk: d.seismic.zone === 'IV' ? 'high' : d.seismic.zone === 'III' ? 'medium' : 'low' },
        { label: 'Peak Ground Accel.',        value: `${d.seismic.peakGroundAcceleration.toFixed(2)}`,  unit: 'g',     risk: d.seismic.peakGroundAcceleration > 0.24 ? 'high' : d.seismic.peakGroundAcceleration > 0.12 ? 'medium' : 'low' },
        { label: 'Soil Type',                 value: d.seismic.soilType,                                unit: '',      risk: d.seismic.soilType === 'Soft' ? 'high' : d.seismic.soilType === 'Medium' ? 'medium' : 'low' },
        { label: 'Design Base Shear',         value: `${(d.seismic.designBaseShear * Math.max(floors, 1)).toFixed(1)}`, unit: 'kN', risk: 'low' },
        { label: 'Response Spectrum (Sa/g)',  value: `${d.seismic.responseSpectrum.toFixed(2)}`,         unit: '',      risk: d.seismic.responseSpectrum > 2.0 ? 'high' : d.seismic.responseSpectrum > 1.6 ? 'medium' : 'low' },
        { label: 'Structural Risk',           value: d.seismic.structuralRisk,                           unit: '',      risk: d.seismic.structuralRisk === 'High' ? 'high' : d.seismic.structuralRisk === 'Moderate' ? 'medium' : 'low' },
      ],
    },
    {
      id: 'thermal',
      name: 'Thermal Performance',
      color: '#f59e0b',
      icon: <Thermometer size={18} />,
      description: `EnergyPlus thermal model for ${d.name}. Climate: ${d.thermal.climateZone}. Summer peak ${d.thermal.avgSummerTempC}°C, solar radiation ${d.thermal.solarRadiation} W/m².`,
      duration: '~2m',
      passThreshold: (dist) => dist.thermal.thermalComfortIndex < 7.5,
      metrics: [
        { label: 'Climate Zone',              value: d.thermal.climateZone,                              unit: '',      risk: d.thermal.climateZone === 'Hot-Humid' ? 'high' : d.thermal.climateZone === 'Hot-Dry' ? 'medium' : 'low' },
        { label: 'Summer Peak Temp',          value: `${d.thermal.avgSummerTempC}`,                      unit: '°C',    risk: d.thermal.avgSummerTempC > 40 ? 'high' : d.thermal.avgSummerTempC > 35 ? 'medium' : 'low' },
        { label: 'Solar Radiation',           value: `${d.thermal.solarRadiation}`,                      unit: 'W/m²',  risk: d.thermal.solarRadiation > 240 ? 'high' : d.thermal.solarRadiation > 210 ? 'medium' : 'low' },
        { label: 'Annual Cooling Load',       value: `${(d.thermal.annualCoolingLoadKwh * totalArea / 929).toFixed(0)}`, unit: 'kWh/yr', risk: 'medium' },
        { label: 'Wall U-Value (recmd)',      value: `${d.thermal.uValueWall.toFixed(2)}`,                unit: 'W/m²K', risk: 'low' },
        { label: 'Thermal Comfort Index',     value: `${d.thermal.thermalComfortIndex.toFixed(1)} / 10`,  unit: '',      risk: d.thermal.thermalComfortIndex > 7.5 ? 'high' : d.thermal.thermalComfortIndex > 5.5 ? 'medium' : 'low' },
      ],
    },
    {
      id: 'wind',
      name: 'Wind Load Study',
      color: '#06b6d4',
      icon: <Wind size={18} />,
      description: `IS 875 Part-3 CFD analysis for ${d.name}. Basic wind speed ${d.wind.basicWindSpeed} km/h, Terrain Category ${d.wind.terrainCategory}. Cyclone risk: ${d.wind.cycloneProbability}.`,
      duration: '~1m',
      passThreshold: (dist) => dist.wind.structuralWindIndex < 7.0,
      metrics: [
        { label: 'Basic Wind Speed',          value: `${d.wind.basicWindSpeed}`,                         unit: 'km/h',  risk: d.wind.basicWindSpeed > 47 ? 'high' : d.wind.basicWindSpeed > 39 ? 'medium' : 'low' },
        { label: 'Design Wind Speed',         value: `${d.wind.designWindSpeed}`,                        unit: 'km/h',  risk: d.wind.designWindSpeed > 55 ? 'high' : d.wind.designWindSpeed > 44 ? 'medium' : 'low' },
        { label: 'Wind Pressure',             value: `${d.wind.windPressure}`,                           unit: 'N/m²',  risk: d.wind.windPressure > 900 ? 'high' : d.wind.windPressure > 600 ? 'medium' : 'low' },
        { label: 'Terrain Category',          value: `Cat ${d.wind.terrainCategory}`,                    unit: '',      risk: d.wind.terrainCategory <= 2 ? 'medium' : 'low' },
        { label: 'Cyclone Probability',       value: d.wind.cycloneProbability,                          unit: '',      risk: d.wind.cycloneProbability === 'High' ? 'high' : d.wind.cycloneProbability === 'Moderate' ? 'medium' : 'low' },
        { label: 'Structural Wind Index',     value: `${d.wind.structuralWindIndex.toFixed(1)} / 10`,    unit: '',      risk: d.wind.structuralWindIndex > 7.0 ? 'high' : d.wind.structuralWindIndex > 4.5 ? 'medium' : 'low' },
      ],
    },
    {
      id: 'electrical',
      name: 'Electrical Load Flow',
      color: '#f97316',
      icon: <Zap size={18} />,
      description: `IEEE 37-bus load flow for ${d.name}. Grid reliability ${d.electrical.gridReliabilityPct}%, tariff ₹${d.electrical.avgTariffPerUnit}/kWh, ${d.electrical.renewableMixPct}% renewable mix.`,
      duration: '~20s',
      passThreshold: (dist) => dist.electrical.gridReliabilityPct >= 90 && dist.electrical.voltageFluctuationPct <= 10,
      metrics: [
        { label: 'Grid Reliability',          value: `${d.electrical.gridReliabilityPct.toFixed(1)}`,   unit: '%',     risk: d.electrical.gridReliabilityPct < 88 ? 'high' : d.electrical.gridReliabilityPct < 93 ? 'medium' : 'low' },
        { label: 'Avg Tariff',                value: `₹${d.electrical.avgTariffPerUnit.toFixed(1)}`,    unit: '/kWh',  risk: 'low' },
        { label: 'Connected Load',            value: `${(d.electrical.connectedLoadPerFloor * Math.max(floors, 1)).toFixed(1)}`, unit: 'kW', risk: 'medium' },
        { label: 'Voltage Fluctuation',       value: `±${d.electrical.voltageFluctuationPct.toFixed(1)}`, unit: '%',  risk: d.electrical.voltageFluctuationPct > 12 ? 'high' : d.electrical.voltageFluctuationPct > 7 ? 'medium' : 'low' },
        { label: 'Renewable Mix',             value: `${d.electrical.renewableMixPct}`,                  unit: '%',     risk: d.electrical.renewableMixPct < 35 ? 'medium' : 'low' },
        { label: 'Recommended Generator',    value: `${d.electrical.recommendedGeneratorKva}`,           unit: 'kVA',   risk: 'low' },
      ],
    },
  ];
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function Risk({ level }: { level?: 'low' | 'medium' | 'high' }) {
  const cfg = { low: { color: '#10b981', label: '●' }, medium: { color: '#f59e0b', label: '●' }, high: { color: '#ef4444', label: '●' } };
  const c = cfg[level ?? 'low'];
  return <span style={{ color: c.color, fontSize: '0.7rem', marginRight: '4px' }} title={level}>{c.label}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
export function SimulationsPage() {
  const { state } = useBuilding();
  const district = state.district;
  const floors = state.floors.length;

  const [statuses, setStatuses] = useState<Record<string, { status: SimStatus; progress?: number; result?: 'PASS' | 'FAIL'; lastRun: string }>>({
    seismic:    { status: 'ready',     lastRun: '—' },
    thermal:    { status: 'ready',     lastRun: '—' },
    wind:       { status: 'ready',     lastRun: '—' },
    electrical: { status: 'ready',     lastRun: '—' },
  });

  const simSpecs = buildSimSpecs(district, floors);

  const handleRun = (sim: SimSpec) => {
    const { id, passThreshold } = sim;
    setStatuses(prev => ({ ...prev, [id]: { status: 'running', progress: 0, lastRun: 'Running…' } }));

    let pct = 0;
    const iv = setInterval(() => {
      pct += Math.random() * 18 + 4;
      if (pct >= 100) {
        clearInterval(iv);
        const pass = passThreshold(district, floors);
        setStatuses(prev => ({ ...prev, [id]: { status: 'completed', progress: 100, lastRun: 'Just now', result: pass ? 'PASS' : 'FAIL' } }));
      } else {
        setStatuses(prev => ({ ...prev, [id]: { ...prev[id], progress: Math.round(pct) } }));
      }
    }, 350);
  };

  const handleReset = (id: string) => {
    setStatuses(prev => ({ ...prev, [id]: { status: 'ready', lastRun: '—' } }));
  };

  const runAll = () => simSpecs.forEach(s => { if (statuses[s.id].status !== 'running') handleRun(s); });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* Header */}
      <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>ENGINEERING ANALYSIS</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Simulations</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <MapPin size={12} color="#06b6d4" />
              <span style={{ color: '#06b6d4', fontWeight: 600 }}>{district.name}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              <span>{district.region}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              <span>{floors} floor{floors !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button onClick={runAll} style={{
            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: '8px', padding: '0.45rem 1rem', fontSize: '0.75rem',
            fontWeight: 600, color: '#06b6d4', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: '0.4rem', transform: 'none',
          }}>
            <Play size={13} /> Run All
          </button>
        </div>

        {/* District quick-stats */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Climate', value: district.thermal.climateZone,            color: '#f59e0b' },
            { label: 'Seismic', value: `Zone ${district.seismic.zone}`,          color: '#ef4444' },
            { label: 'Wind',    value: `${district.wind.basicWindSpeed} km/h`,   color: '#06b6d4' },
            { label: 'Grid',    value: `${district.electrical.gridReliabilityPct}% uptime`, color: '#10b981' },
            { label: 'Tariff',  value: `₹${district.electrical.avgTariffPerUnit}/kWh`, color: '#f97316' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px', padding: '0.3rem 0.65rem', fontSize: '0.68rem' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>{s.label}: </span>
              <span style={{ color: s.color, fontWeight: 700 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sim cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem', alignContent: 'start' }}>
        {simSpecs.map(sim => {
          const st = statuses[sim.id];
          const statusCfg = STATUS_CONFIG[st.status];
          return (
            <div key={sim.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = `${sim.color}40`}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)'}
            >
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${sim.color}15`, border: `1px solid ${sim.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sim.color, flexShrink: 0 }}>
                    {sim.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sim.name}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>Duration: {sim.duration} · Last: {st.lastRun}</div>
                  </div>
                </div>
                <span style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.color}30`, borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em', flexShrink: 0 }}>
                  {statusCfg.label}
                </span>
              </div>

              {/* Description */}
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sim.description}</p>

              {/* Metrics grid — shown after completion */}
              {st.status === 'completed' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                  {sim.metrics.map(m => (
                    <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.4rem 0.55rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginBottom: '2px' }}>{m.label}</div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center' }}>
                        <Risk level={m.risk} />
                        {m.value}{m.unit && <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginLeft: '2px' }}>{m.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress bar */}
              {st.status === 'running' && st.progress !== undefined && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
                    <span>Analysing {district.name}…</span>
                    <span>{st.progress}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${st.progress}%`, background: `linear-gradient(90deg, ${sim.color}, ${sim.color}80)`, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              {/* Result badge */}
              {st.status === 'completed' && st.result && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 700, color: st.result === 'PASS' ? '#10b981' : '#ef4444' }}>
                  {st.result === 'PASS' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {st.result === 'PASS' ? `All checks passed for ${district.name}` : `Review required — ${district.name} exceeds threshold`}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={() => handleRun(sim)} disabled={st.status === 'running'} style={{ flex: 1, background: st.status === 'running' ? 'rgba(255,255,255,0.04)' : `${sim.color}20`, border: `1px solid ${st.status === 'running' ? 'var(--border-subtle)' : `${sim.color}40`}`, borderRadius: '7px', padding: '0.45rem', fontSize: '0.73rem', fontWeight: 600, color: st.status === 'running' ? 'var(--text-tertiary)' : sim.color, cursor: st.status === 'running' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', transform: 'none' }}>
                  {st.status === 'running' ? <><Pause size={12} /> Running</> : <><Play size={12} /> Run</>}
                </button>
                <button onClick={() => handleReset(sim.id)} style={{ width: '36px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '7px', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'none' }}>
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
