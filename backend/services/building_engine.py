"""
Building Engine — MCP Tool: execute_building_action

Applies validated mutations to the building state.
Every mutation returns the updated state + a changelog entry.
"""
import uuid
from datetime import datetime, timezone
from copy import deepcopy

from models.building import BuildingState, Floor, Room, HistoryEntry, ROOM_DEFAULT_SQFT, ROOM_COST_MULTIPLIERS


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_room(floor_number: int, index: int, area_sqft: int = 500) -> Room:
    return Room(
        id=f"room-{floor_number}-{index}-{uuid.uuid4().hex[:6]}",
        name=f"Room {index}",
        type="general",
        area_sqft=area_sqft,
    )


def _recalculate_budget(state: BuildingState) -> BuildingState:
    """Recompute used/remaining from scratch based on current floors/rooms."""
    cost_per_floor = state.budget.costPerFloor
    cost_per_sqft = state.budget.costPerSqft
    used = sum(
        cost_per_floor + sum((r.area_sqft * cost_per_sqft) for r in f.rooms)
        for f in state.floors
    )
    state.budget.used = used
    state.budget.remaining = state.budget.total - used
    return state


def add_floor(state: BuildingState) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    new_number = len(state.floors) + 1
    floor = Floor(
        id=f"floor-{new_number}-{uuid.uuid4().hex[:6]}",
        number=new_number,
        rooms=[_next_room(new_number, 1, state.constraints.defaultRoomSqft)],
    )
    state.floors.append(floor)
    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="add_floor",
        timestamp=_now(),
        details=f"Added Floor {new_number} with 1 default room.",
    )
    state.history.append(entry)
    return state, entry


def add_floors(state: BuildingState, count: int) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    start = len(state.floors) + 1
    for i in range(count):
        n = start + i
        floor = Floor(
            id=f"floor-{n}-{uuid.uuid4().hex[:6]}",
            number=n,
            rooms=[_next_room(n, 1, state.constraints.defaultRoomSqft)],
        )
        state.floors.append(floor)
    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="add_floors",
        timestamp=_now(),
        details=f"Added {count} floor(s) (Floor {start} to Floor {start + count - 1}), each with 1 default room.",
    )
    state.history.append(entry)
    return state, entry


def remove_floor(state: BuildingState, floor_number: int) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    state.floors = [f for f in state.floors if f.number != floor_number]
    # Renumber remaining floors
    state.floors.sort(key=lambda f: f.number)
    for i, floor in enumerate(state.floors):
        floor.number = i + 1
        floor.id = f"floor-{i + 1}-{floor.id.split('-')[-1]}"
    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="remove_floor",
        timestamp=_now(),
        details=f"Removed Floor {floor_number}. Remaining floors renumbered.",
    )
    state.history.append(entry)
    return state, entry


def add_rooms(state: BuildingState, floor_number: int, count: int) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    for floor in state.floors:
        if floor.number == floor_number:
            start_idx = len(floor.rooms) + 1
            for i in range(count):
                floor.rooms.append(_next_room(floor_number, start_idx + i, state.constraints.defaultRoomSqft))
            break
    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="add_rooms",
        timestamp=_now(),
        details=f"Added {count} room(s) to Floor {floor_number}.",
    )
    state.history.append(entry)
    return state, entry


def remove_rooms(state: BuildingState, floor_number: int, count: int) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    for floor in state.floors:
        if floor.number == floor_number:
            floor.rooms = floor.rooms[:-count]
            # Re-index room names
            for i, room in enumerate(floor.rooms):
                room.name = f"Room {i + 1}"
            break
    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="remove_rooms",
        timestamp=_now(),
        details=f"Removed {count} room(s) from Floor {floor_number}.",
    )
    state.history.append(entry)
    return state, entry


def set_budget(state: BuildingState, amount: int) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    state.budget.total = amount
    state.budget.remaining = amount - state.budget.used
    entry = HistoryEntry(
        action="set_budget",
        timestamp=_now(),
        details=f"Budget updated to ₹{amount:,}.",
    )
    state.history.append(entry)
    return state, entry


def rename_room(state: BuildingState, floor_number: int, room_index: int, name: str) -> tuple[BuildingState, HistoryEntry]:
    state = deepcopy(state)
    for floor in state.floors:
        if floor.number == floor_number:
            if 0 <= room_index < len(floor.rooms):
                old_name = floor.rooms[room_index].name
                floor.rooms[room_index].name = name
            break
    entry = HistoryEntry(
        action="rename_room",
        timestamp=_now(),
        details=f"Renamed room {room_index + 1} on Floor {floor_number} to '{name}'.",
    )
    state.history.append(entry)
    return state, entry


def reset_building(state: BuildingState) -> tuple[BuildingState, HistoryEntry]:
    from state.store import _make_initial_state
    new_state = _make_initial_state()
    
    # Retain custom configuration limits
    new_state.constraints.shape = state.constraints.shape
    new_state.constraints.defaultRoomSqft = state.constraints.defaultRoomSqft
    new_state.budget.total = state.budget.total
    new_state.budget.remaining = state.budget.total
    new_state.budget.costPerSqft = state.budget.costPerSqft
    
    entry = HistoryEntry(
        action="reset_building",
        timestamp=_now(),
        details="Building reset to initial state.",
    )
    new_state.history = state.history + [entry]
    return new_state, entry


def add_typed_room(
    state: BuildingState, floor_number: int, room_type: str, count: int = 1
) -> tuple[BuildingState, HistoryEntry]:
    """Add one or more rooms of a specific type (bedroom, bathroom, kitchen, etc.)."""
    state = deepcopy(state)
    room_type = room_type.lower().strip()
    sqft = ROOM_DEFAULT_SQFT.get(room_type, state.constraints.defaultRoomSqft)

    for floor in state.floors:
        if floor.number == floor_number:
            start_idx = len(floor.rooms) + 1
            for i in range(count):
                floor.rooms.append(Room(
                    id=f"room-{floor_number}-{start_idx + i}-{uuid.uuid4().hex[:6]}",
                    name=f"{room_type.capitalize()} {start_idx + i}",
                    type=room_type,
                    area_sqft=sqft,
                ))
            break

    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="add_typed_room",
        timestamp=_now(),
        details=f"Added {count} {room_type}(s) to Floor {floor_number}.",
    )
    state.history.append(entry)
    return state, entry


def remove_typed_rooms(
    state: BuildingState, floor_number: int, room_type: str, count: int = 1
) -> tuple[BuildingState, HistoryEntry]:
    """Remove rooms of a specific type from the given floor."""
    state = deepcopy(state)
    room_type = room_type.lower().strip()

    for floor in state.floors:
        if floor.number == floor_number:
            removed = 0
            new_rooms = []
            for r in floor.rooms:
                if r.type == room_type and removed < count:
                    removed += 1
                else:
                    new_rooms.append(r)
            floor.rooms = new_rooms
            break

    state = _recalculate_budget(state)
    entry = HistoryEntry(
        action="remove_typed_rooms",
        timestamp=_now(),
        details=f"Removed {count} {room_type}(s) from Floor {floor_number}.",
    )
    state.history.append(entry)
    return state, entry

