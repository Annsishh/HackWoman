import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import { getDefaultDistrict, type DistrictData } from '../data/karnataka_db';

// --- Types ---
export interface Room {
  id: string;
  name: string;
  type: string;
  area_sqft: number;
}

export interface Floor {
  id: string;
  number: number;
  rooms: Room[];
}

export interface Budget {
  total: number;
  used: number;
  remaining: number;
  costPerFloor: number;
  costPerRoom: number;
  costPerSqft: number;
}

export interface Constraints {
  maxFloors: number;
  maxRoomsPerFloor: number;
  minRoomsPerFloor: number;
  defaultRoomSqft: number;
  shape: string;
}

export interface BuildingState {
  floors: Floor[];
  budget: Budget;
  constraints: Constraints;
  history: Array<{ action: string; timestamp: string; details: string }>;
  district: DistrictData;
}

// --- Initial State ---
const INITIAL_BUDGET = 5000000; // 50 Lakh

const initialState: BuildingState = {
  floors: [],
  budget: {
    total: INITIAL_BUDGET,
    used: 0,
    remaining: INITIAL_BUDGET,
    costPerFloor: 500000, // 5 Lakh
    costPerRoom: 100000,  // 1 Lakh
    costPerSqft: 200,
  },
  constraints: {
    maxFloors: 10,
    maxRoomsPerFloor: 6,
    minRoomsPerFloor: 1,
    defaultRoomSqft: 500,
    shape: 'rectangle',
  },
  history: [],
  district: getDefaultDistrict(),
};

// --- Actions ---
export type BuildingAction =
  | { type: 'SET_STATE'; payload: BuildingState }
  | { type: 'SET_DISTRICT'; payload: DistrictData }
  | { type: 'RESET' };

// --- Reducer ---
function buildingReducer(state: BuildingState, action: BuildingAction): BuildingState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...action.payload, district: action.payload.district ?? state.district };
    case 'SET_DISTRICT':
      return { ...state, district: action.payload };
    case 'RESET':
      return {
        ...initialState,
        district: state.district,
        budget: {
          ...initialState.budget,
          total: state.budget.total,
          remaining: state.budget.total,
          costPerSqft: state.budget.costPerSqft,
        },
        constraints: {
          ...initialState.constraints,
          defaultRoomSqft: state.constraints.defaultRoomSqft,
          shape: state.constraints.shape,
        },
        history: [{ action: 'reset', timestamp: new Date().toISOString(), details: 'Building reset to empty state' }]
      };
    default:
      return state;
  }
}

// --- Context ---
const BuildingContext = createContext<{
  state: BuildingState;
  dispatch: React.Dispatch<BuildingAction>;
} | undefined>(undefined);

export function BuildingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(buildingReducer, initialState);

  return (
    <BuildingContext.Provider value={{ state, dispatch }}>
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding() {
  const context = useContext(BuildingContext);
  if (context === undefined) {
    throw new Error('useBuilding must be used within a BuildingProvider');
  }
  return context;
}
