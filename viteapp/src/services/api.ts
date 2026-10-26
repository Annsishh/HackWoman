/**
 * Thin HTTP client for the AI Architect Assistant backend.
 * All network calls go through this module.
 */
import { API_BASE_URL } from '../utils/constants';
import type { BuildingState, Rect, WindowSpec, SiteLocation } from '../context/BuildingContext';

// ── Response shapes ──────────────────────────────────────────────────────────

export interface MaterialsCostBreakdown {
  concrete: number;
  steel: number;
  glass: number;
  total: number;
  /** "kpwd_sr" (Schedule of Rates bill of quantities), "ml_model" or "formula" */
  source?: string;
}

/** One priced line of the KPWD Schedule of Rates bill of quantities. */
export interface BOQLine {
  key: string;
  label: string;
  category: 'material' | 'labour' | 'add_on' | 'fitting' | 'regional' | 'tax';
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  ref: string;
  page: string;
  /** verified = checked against KPWD Vol 2; placeholder = awaiting a Vol 1 / quarterly rate */
  status: 'verified' | 'placeholder' | 'interim' | 'derived';
}

export interface BOQBreakdown {
  district_id: string;
  plinth_area_m2: number;
  floors: number;
  relation_set: 'single' | 'double' | 'none';
  approximate: boolean;
  lines: BOQLine[];
  subtotal: number;
  regional_pct: number;
  regional_status: string;
  include_gst: boolean;
  total: number;
  placeholders_used: number;
  notes: string[];
}

export interface HistoryEntry {
  action: string;
  timestamp: string;
  details: string;
}

export interface AnimationHint {
  type: string;
  target: Record<string, unknown>;
}

export type MessageType = 'success' | 'error' | 'warning' | 'info';

export interface ChatResponse {
  message: string;
  message_type: MessageType;
  updatedState: BuildingState | null;
  suggestions: string[];
  actionLog: HistoryEntry | null;
  animationHint: AnimationHint | null;
  costBreakdown: MaterialsCostBreakdown | null;
  structuralRisk: number | null;
  /** Something only the browser can do, e.g. "request_geolocation" */
  clientAction?: string | null;
}

export interface ModelInfo {
  ml_dependencies_available: boolean;
  districts_loaded: number;
  cost_model: { loaded: boolean; meta: Record<string, unknown> | null };
  risk_model: { loaded: boolean; meta: Record<string, unknown> | null };
}

// ── Keeping the page in step with the server ─────────────────────────────────
// If the server says a floor/room doesn't exist, the page is showing a stale
// building (e.g. the backend restarted). Listeners get the server's real state.

type StateListener = (state: BuildingState) => void;
const stateListeners = new Set<StateListener>();

export function onServerState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
}

async function resyncFromServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/state`);
    if (!res.ok) return false;
    const state = (await res.json()) as BuildingState;
    stateListeners.forEach(l => l(state));
    return true;
  } catch {
    return false;
  }
}

// ── Internal fetch helper ────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore parse errors
    }
    if (res.status === 404 || /doesn't exist|not found/i.test(detail)) {
      if (await resyncFromServer()) {
        detail += ' Your screen was out of date, so it has been refreshed from the server — please try again.';
      }
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Fetch the current authoritative building state from the server. */
export async function fetchBuildingState(): Promise<BuildingState> {
  return request<BuildingState>('/api/state');
}

/**
 * Send a natural language message to the orchestrator.
 * Returns the full ChatResponse including the (possibly) updated state.
 */
export async function sendMessage(message: string): Promise<ChatResponse> {
  return request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

/** Hard-reset the building on the server and return the fresh state. */
export async function resetBuilding(): Promise<BuildingState> {
  return request<BuildingState>('/api/reset', { method: 'POST' });
}

/** Health check — resolves true if the backend is reachable. */
export async function checkHealth(): Promise<boolean> {
  try {
    await request('/health');
    return true;
  } catch {
    return false;
  }
}

/** Verifies whether the trained cost/risk models are loaded and serving. */
export async function getModelInfo(): Promise<ModelInfo> {
  return request<ModelInfo>('/api/model-info');
}

// ── Floor-plan editor: user-placed rooms & site features ─────────────────────

export async function placeRoom(floorNumber: number, type: string, rect: Rect, name?: string): Promise<BuildingState> {
  return request<BuildingState>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ floor_number: floorNumber, type, name: name || null, ...rect }),
  });
}

/** Move / resize / first-time place a room, or rename it. */
export async function updateRoom(roomId: string, changes: { rect?: Rect; name?: string }): Promise<BuildingState> {
  return request<BuildingState>(`/api/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export async function deleteRoom(roomId: string): Promise<BuildingState> {
  return request<BuildingState>(`/api/rooms/${roomId}`, { method: 'DELETE' });
}

export async function addSiteFeature(type: 'parking' | 'garden', rect: Rect, name?: string): Promise<BuildingState> {
  return request<BuildingState>('/api/site-features', {
    method: 'POST',
    body: JSON.stringify({ type, name: name || null, ...rect }),
  });
}

export async function updateSiteFeature(featureId: string, rect: Rect): Promise<BuildingState> {
  return request<BuildingState>(`/api/site-features/${featureId}`, { method: 'PATCH', body: JSON.stringify(rect) });
}

export async function deleteSiteFeature(featureId: string): Promise<BuildingState> {
  return request<BuildingState>(`/api/site-features/${featureId}`, { method: 'DELETE' });
}

/** Give one floor its own shape; the backend rejects shapes that overhang the floor below. */
export async function setFloorShape(floorNumber: number, shape: string): Promise<BuildingState> {
  return request<BuildingState>(`/api/floors/${floorNumber}`, { method: 'PATCH', body: JSON.stringify({ shape }) });
}

/** Set the windows on one outside wall of a room (count 0 removes them). */
export async function setRoomWindows(roomId: string, spec: WindowSpec): Promise<BuildingState> {
  return request<BuildingState>(`/api/rooms/${roomId}/windows`, { method: 'PUT', body: JSON.stringify(spec) });
}

export async function setWalls(exteriorIn: number, interiorIn: number): Promise<BuildingState> {
  return request<BuildingState>('/api/walls', {
    method: 'PUT',
    body: JSON.stringify({ exterior_in: exteriorIn, interior_in: interiorIn }),
  });
}

/** Add several rooms to one floor — optionally laid out as a starting point the user can move. */
export async function addRoomsBatch(
  floorNumber: number,
  rooms: { type: string; area_sqft: number; name?: string }[],
  arrange: boolean,
): Promise<BuildingState> {
  return request<BuildingState>('/api/rooms/batch', {
    method: 'POST',
    body: JSON.stringify({ floor_number: floorNumber, rooms, arrange }),
  });
}

// ── Site location & KPWD Schedule of Rates costing ───────────────────────────

/** Set where the building is from coordinates (GPS / map) or a place name. */
export async function setLocation(
  loc: { lat: number; lng: number; source: SiteLocation['source'] } | { query: string },
): Promise<ChatResponse> {
  return request<ChatResponse>('/api/location', { method: 'POST', body: JSON.stringify(loc) });
}

/** Ask the browser for the user's position (needs their permission). */
export function getBrowserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser does not support location. Type a place instead, e.g. "build it in Mysuru".'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED
        ? 'Location access was blocked. Type a place instead, e.g. "build it in Mysuru".'
        : 'Could not get your location. Type a place instead, e.g. "build it in Mysuru".')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

/** The building priced line by line from the KPWD Schedule of Rates. */
export async function getBoq(): Promise<BOQBreakdown> {
  return request<BOQBreakdown>('/api/estimate/boq');
}

/** Include or exclude 18% GST (KPWD rates exclude it). */
export async function setIncludeGst(include: boolean): Promise<BuildingState> {
  return request<BuildingState>('/api/estimate/gst', { method: 'PUT', body: JSON.stringify({ include }) });
}
