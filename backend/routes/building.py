from fastapi import APIRouter
from pydantic import BaseModel
from models.building import BuildingState, HistoryEntry
from state.store import store
from services.building_engine import _recalculate_budget
from datetime import datetime, timezone

router = APIRouter()


@router.get("/state", response_model=BuildingState)
async def get_state() -> BuildingState:
    """Return the current authoritative building state."""
    return store.get()


@router.post("/reset", response_model=BuildingState)
async def reset_building() -> BuildingState:
    """Reset the building to its initial empty state."""
    return store.reset()


class ConfigRequest(BaseModel):
    total_budget: int
    default_room_sqft: int
    shape: str

@router.post("/configure", response_model=BuildingState)
async def configure_building(config: ConfigRequest) -> BuildingState:
    """Apply new budget and default sqft, updating existing rooms."""
    state = store.get()
    
    state.budget.total = config.total_budget
    state.constraints.defaultRoomSqft = config.default_room_sqft
    state.constraints.shape = config.shape
    
    # Retroactively apply to existing rooms
    for floor in state.floors:
        for room in floor.rooms:
            room.area_sqft = config.default_room_sqft
            
    # Recalculate budget consumption with new values
    state = _recalculate_budget(state)
    
    entry = HistoryEntry(
        action="configure",
        timestamp=datetime.now(timezone.utc).isoformat(),
        details=f"Configuration updated: Budget ₹{config.total_budget:,}, Room SqFt {config.default_room_sqft}"
    )
    state.history.append(entry)
    
    store.set(state)
    return state
