"""
In-memory singleton building state store.
The backend owns the authoritative building state.
"""
from models.building import BuildingState, Budget, Constraints
import os


INITIAL_BUDGET = int(os.getenv("INITIAL_BUDGET", "5000000"))
MAX_FLOORS = int(os.getenv("MAX_FLOORS", "10"))
MAX_ROOMS_PER_FLOOR = int(os.getenv("MAX_ROOMS_PER_FLOOR", "6"))


def _make_initial_state() -> BuildingState:
    return BuildingState(
        floors=[],
        budget=Budget(
            total=INITIAL_BUDGET,
            used=0,
            remaining=INITIAL_BUDGET,
            costPerFloor=500_000,
            costPerRoom=100_000,
        ),
        constraints=Constraints(
            maxFloors=MAX_FLOORS,
            maxRoomsPerFloor=MAX_ROOMS_PER_FLOOR,
            minRoomsPerFloor=1,
        ),
        history=[],
    )


class _StateStore:
    def __init__(self):
        self._state: BuildingState = _make_initial_state()

    def get(self) -> BuildingState:
        return self._state

    def set(self, new_state: BuildingState) -> None:
        self._state = new_state

    def reset(self) -> BuildingState:
        self._state = _make_initial_state()
        return self._state


# Module-level singleton
store = _StateStore()
