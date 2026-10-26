"""
Singleton building state store.
The backend owns the authoritative building state. It's kept in memory and
mirrored to a JSON file, so restarting the server (e.g. uvicorn --reload after
a code change) doesn't silently wipe the user's building while their browser
still shows it.
"""
from models.building import BuildingState, Budget, Constraints
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


INITIAL_BUDGET = int(os.getenv("INITIAL_BUDGET", "5000000"))
MAX_FLOORS = int(os.getenv("MAX_FLOORS", "10"))
MAX_ROOMS_PER_FLOOR = int(os.getenv("MAX_ROOMS_PER_FLOOR", "12"))
# Set BUILDING_STATE_FILE="" to keep state in memory only
STATE_FILE = os.getenv("BUILDING_STATE_FILE", str(Path(__file__).with_name("building_state.json")))


def _make_initial_state() -> BuildingState:
    from services.geometry import plot_layout

    constraints = Constraints(
        maxFloors=MAX_FLOORS,
        maxRoomsPerFloor=MAX_ROOMS_PER_FLOOR,
        minRoomsPerFloor=1,
    )
    return BuildingState(
        floors=[],
        budget=Budget(
            total=INITIAL_BUDGET,
            used=0,
            remaining=INITIAL_BUDGET,
            costPerFloor=500_000,
            costPerRoom=100_000,
        ),
        constraints=constraints,
        site=plot_layout(constraints.shape, constraints.floorAreaSqft, constraints.plotAreaSqft),
        history=[],
    )


class _StateStore:
    def __init__(self):
        from services.building_engine import _recalculate_budget
        # Reprice on load: a state saved under older pricing would otherwise show a stale budget
        self._state: BuildingState = _recalculate_budget(self._load() or _make_initial_state())

    def get(self) -> BuildingState:
        return self._state

    def set(self, new_state: BuildingState) -> None:
        self._state = new_state
        self._save()

    def reset(self) -> BuildingState:
        self._state = _make_initial_state()
        self._save()
        return self._state

    def _load(self) -> BuildingState | None:
        if not STATE_FILE or not os.path.exists(STATE_FILE):
            return None
        try:
            return BuildingState.model_validate_json(Path(STATE_FILE).read_text(encoding="utf-8"))
        except Exception as exc:  # old/corrupt file — start fresh rather than crash
            logger.warning("Ignoring saved building state %s: %s", STATE_FILE, exc)
            return None

    def _save(self) -> None:
        if not STATE_FILE:
            return
        try:
            tmp = Path(STATE_FILE).with_suffix(".tmp")
            # Explicit UTF-8: Windows defaults to cp1252, which can't encode the ₹ in history entries
            tmp.write_text(self._state.model_dump_json(), encoding="utf-8")
            tmp.replace(STATE_FILE)  # atomic, so a crash never leaves half a file
        except (OSError, ValueError) as exc:  # a failed save must never fail the request
            logger.warning("Could not save building state: %s", exc)


# Module-level singleton
store = _StateStore()
