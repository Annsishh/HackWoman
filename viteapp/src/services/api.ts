/**
 * Thin HTTP client for the AI Architect Assistant backend.
 * All network calls go through this module.
 */
import { API_BASE_URL } from '../utils/constants';
import type { BuildingState } from '../context/BuildingContext';

// ── Response shapes ──────────────────────────────────────────────────────────

export interface MaterialsCostBreakdown {
  concrete: number;
  steel: number;
  glass: number;
  total: number;
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
