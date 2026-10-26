import React, { useState } from 'react';
import { useBuilding } from '../../context/BuildingContext';
import { KARNATAKA_DISTRICTS, getDistrictById } from '../../data/karnataka_db';
import { API_BASE_URL } from '../../utils/constants';
import './ConfigurationModal.css';

interface ConfigurationModalProps {
  onComplete: () => void;
}

export function ConfigurationModal({ onComplete }: ConfigurationModalProps) {
  const { dispatch } = useBuilding();

  const [budgetLakhs, setBudgetLakhs] = useState<string>('50');
  const [roomSqft, setRoomSqft] = useState<string>('500');
  const [shape, setShape] = useState<string>('rectangle');
  const [districtId, setDistrictId] = useState<string>('bengaluru-urban');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDistrict = getDistrictById(districtId);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();

    const budgetVal = parseInt(budgetLakhs, 10);
    const sqftVal = parseInt(roomSqft, 10);
    if (isNaN(budgetVal) || budgetVal <= 0) return;
    if (isNaN(sqftVal) || sqftVal <= 0) return;

    setIsSubmitting(true);

    try {
      const totalBudgetInr = budgetVal * 100000;

      const res = await fetch(`${API_BASE_URL}/api/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_budget: totalBudgetInr,
          default_room_sqft: sqftVal,
          shape,
        }),
      });

      if (!res.ok) throw new Error('Failed to configure building');

      const updatedState = await res.json();
      dispatch({ type: 'SET_STATE', payload: updatedState });

      if (selectedDistrict) {
        dispatch({ type: 'SET_DISTRICT', payload: selectedDistrict });
      }

      onComplete();
    } catch (err) {
      console.error('Configuration error:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <h2 className="modal-title">Project Setup</h2>
        <p className="modal-subtitle">Configure your building project before starting.</p>

        <form onSubmit={handleSubmit} className="setup-form">

          {/* District */}
          <div className="form-group">
            <label htmlFor="district">District (Karnataka)</label>
            <select
              id="district"
              value={districtId}
              onChange={e => setDistrictId(e.target.value)}
              className="setup-input"
              required
            >
              <option value="" disabled>Select a district</option>
              {KARNATAKA_DISTRICTS.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {selectedDistrict && (
              <div style={{
                marginTop: '0.65rem', fontSize: '0.68rem', 
                display: 'flex', gap: '0.5rem', flexWrap: 'wrap', lineHeight: 1.6,
              }}>
                {[
                  { text: selectedDistrict.region, color: '#7c3aed' },
                  { text: selectedDistrict.thermal.climateZone, color: '#f59e0b' },
                  { text: `Seismic Zone ${selectedDistrict.seismic.zone}`, color: '#ef4444' },
                  { text: `Wind ${selectedDistrict.wind.basicWindSpeed} km/h`, color: '#06b6d4' },
                ].map(({ text, color }) => (
                  <span key={text} style={{ 
                    color, 
                    background: `${color}12`, 
                    border: `1px solid ${color}30`, 
                    borderRadius: '20px', 
                    padding: '0.15rem 0.6rem', 
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}>{text}</span>
                ))}
              </div>
            )}
          </div>

          {/* Budget */}
          <div className="form-group">
            <label htmlFor="budget">Total Budget (in ₹ Lakhs)</label>
            <input
              id="budget"
              type="number"
              min="1"
              value={budgetLakhs}
              onChange={e => setBudgetLakhs(e.target.value)}
              className="setup-input"
              required
            />
          </div>

          {/* Room sqft */}
          <div className="form-group">
            <label htmlFor="sqft">Default Room Area (sq. ft.)</label>
            <input
              id="sqft"
              type="number"
              min="50"
              step="10"
              value={roomSqft}
              onChange={e => setRoomSqft(e.target.value)}
              className="setup-input"
              required
            />
          </div>

          {/* Shape */}
          <div className="form-group">
            <label htmlFor="shape">Building Shape</label>
            <select
              id="shape"
              value={shape}
              onChange={e => setShape(e.target.value)}
              className="setup-input"
              required
            >
              <option value="rectangle">Rectangle</option>
              <option value="square">Square</option>
              <option value="pyramid">Pyramid</option>
            </select>
          </div>

          <button type="submit" className="setup-button" disabled={isSubmitting}>
            {isSubmitting ? 'Starting...' : 'Start Building'}
          </button>
        </form>
      </div>
    </div>
  );
}
