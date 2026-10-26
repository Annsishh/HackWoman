from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

# Supported room types (used across backend + frontend)
ROOM_TYPES = ["bedroom", "bathroom", "kitchen", "hallway", "office", "store", "general"]
RoomType = Literal["bedroom", "bathroom", "kitchen", "hallway", "office", "store", "general"]

# Cost multipliers relative to base sqft cost (e.g. kitchen costs 1.8× more than general)
ROOM_COST_MULTIPLIERS: dict[str, float] = {
    "bedroom":  1.0,
    "bathroom": 1.5,
    "kitchen":  1.8,
    "hallway":  0.6,
    "office":   1.2,
    "store":    0.8,
    "general":  1.0,
}

# Default square footage per room type (sqft)
ROOM_DEFAULT_SQFT: dict[str, int] = {
    "bedroom":  250,
    "bathroom":  80,
    "kitchen":  150,
    "hallway":  120,
    "office":   200,
    "store":    180,
    "general":  200,
}


class Room(BaseModel):
    id: str
    name: str
    type: str = "general"
    area_sqft: int = 200


class Floor(BaseModel):
    id: str
    number: int
    rooms: List[Room] = Field(default_factory=list)


class Budget(BaseModel):
    total: int = 5_000_000
    used: int = 0
    remaining: int = 5_000_000
    costPerFloor: int = 500_000
    costPerRoom: int = 100_000
    costPerSqft: int = 200


class Constraints(BaseModel):
    maxFloors: int = 10
    maxRoomsPerFloor: int = 6
    minRoomsPerFloor: int = 1
    defaultRoomSqft: int = 500
    shape: str = "rectangle"


class HistoryEntry(BaseModel):
    action: str
    timestamp: str
    details: str


class BuildingState(BaseModel):
    floors: List[Floor] = Field(default_factory=list)
    budget: Budget = Field(default_factory=Budget)
    constraints: Constraints = Field(default_factory=Constraints)
    history: List[HistoryEntry] = Field(default_factory=list)


# --- Request / Response models ---

class ChatRequest(BaseModel):
    message: str


class MaterialsCostBreakdown(BaseModel):
    concrete: int
    steel: int
    glass: int
    total: int


class ValidationResult(BaseModel):
    valid: bool
    violations: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


class AnimationHint(BaseModel):
    type: str          # "add_floor", "remove_floor", "add_rooms", "remove_rooms", "error"
    target: dict = Field(default_factory=dict)   # e.g. { "floorNumber": 1, "count": 2 }


class ChatResponse(BaseModel):
    message: str
    message_type: str = "info"   # "success" | "error" | "warning" | "info"
    updatedState: Optional[BuildingState] = None
    suggestions: List[str] = Field(default_factory=list)
    actionLog: Optional[HistoryEntry] = None
    animationHint: Optional[AnimationHint] = None
    costBreakdown: Optional[MaterialsCostBreakdown] = None


class InterpretedAction(BaseModel):
    action: str
    params: dict = Field(default_factory=dict)
    confidence: float = 1.0
    clarification_needed: bool = False
    clarification_message: str = ""
