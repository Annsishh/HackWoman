"""
MCP Orchestrator — The Controller

Receives a user message and orchestrates the full tool pipeline:
  1. interpret_command   → structured action
  2. estimate_materials_cost → cost check
  3. check_structural_integrity → physics check
  4. check_compliance    → code check
  5. execute_building_action → state mutation
  6. generate_suggestions → smart recommendations
  7. Return ChatResponse

This is the ONLY entry point that coordinates all MCP services.
"""
import logging
from models.building import (
    BuildingState,
    ChatResponse,
    HistoryEntry,
    AnimationHint,
)
from services.intent_interpreter import interpret_command
from services.structural_inspector import check_structural_integrity_for_action
from services.compliance_service import check_compliance_for_action
from services.materials_estimator import estimate_materials_cost, format_cost
from services.suggestion_engine import generate_suggestions
import services.building_engine as engine

logger = logging.getLogger(__name__)

# Actions that mutate state
_MUTATION_ACTIONS = {
    "add_floor", "add_floors", "remove_floor",
    "add_rooms", "remove_rooms",
    "add_typed_room", "remove_typed_rooms",
    "set_budget", "rename_room", "reset_building",
}

# Map action → animation type for the visualizer
_ANIMATION_MAP = {
    "add_floor": "add_floor",
    "add_floors": "add_floor",
    "remove_floor": "remove_floor",
    "add_rooms": "add_rooms",
    "remove_rooms": "remove_rooms",
    "reset_building": "reset",
}


async def process_message(message: str, state: BuildingState) -> ChatResponse:
    """
    Full MCP pipeline. Returns a ChatResponse with updated state and suggestions.
    """
    # ── Step 1: Interpret ───────────────────────────────────────────────────
    interpreted = await interpret_command(message, state)
    logger.info("Interpreted action: %s params: %s", interpreted.action, interpreted.params)

    # ── Clarification needed ────────────────────────────────────────────────
    if interpreted.clarification_needed or interpreted.action == "unknown":
        return ChatResponse(
            message=interpreted.clarification_message or "I'm not sure what you meant. Try 'add a floor' or 'add 2 rooms on floor 1'.",
            message_type="warning",
            suggestions=generate_suggestions(state, errors=[interpreted.clarification_message or ""]),
        )

    # ── Informational actions (no mutation) ─────────────────────────────────
    if interpreted.action == "show_status":
        return _show_status(state)

    if interpreted.action == "get_suggestions":
        suggs = generate_suggestions(state)
        return ChatResponse(
            message=_format_suggestions_message(suggs, state),
            message_type="info",
            suggestions=suggs,
        )

    if interpreted.action not in _MUTATION_ACTIONS:
        return ChatResponse(
            message=f"I recognised '{interpreted.action}' but don't know how to handle it yet.",
            message_type="warning",
            suggestions=generate_suggestions(state),
        )

    action = interpreted.action
    params = interpreted.params

    # ── Step 2: Floor existence pre-check (add_rooms / remove_rooms / remove_floor) ──
    if action in ("add_rooms", "remove_rooms", "remove_floor"):
        floor_number = params.get("floor_number")
        floor_exists = any(f.number == floor_number for f in state.floors)
        if not floor_exists:
            sugg_msg = f"Floor {floor_number} doesn't exist yet."
            suggs = [
                f"Type 'add a floor' to create Floor {len(state.floors) + 1} first.",
                f"Or say 'add floor {floor_number} with {params.get('count', 1)} rooms' to do it in one step.",
            ]
            return ChatResponse(
                message=f"{sugg_msg} Want me to add it first?",
                message_type="warning",
                suggestions=suggs,
            )

    # ── Step 3: Materials cost estimate ─────────────────────────────────────
    cost_breakdown, within_budget = estimate_materials_cost(action, params, state)
    if not within_budget and action not in ("remove_floor", "remove_rooms", "set_budget", "reset_building"):
        over_by = cost_breakdown.total - state.budget.remaining
        suggs = generate_suggestions(state, errors=[f"Over budget by {format_cost(over_by)}"])
        return ChatResponse(
            message=(
                f"Adding this would cost {format_cost(cost_breakdown.total)}, "
                f"but you only have {format_cost(state.budget.remaining)} left. "
                f"You'd exceed your budget by {format_cost(over_by)}."
            ),
            message_type="error",
            costBreakdown=cost_breakdown,
            suggestions=suggs,
        )

    # ── Step 4: Structural integrity check ──────────────────────────────────
    structural = check_structural_integrity_for_action(action, params, state)
    if not structural.valid:
        return ChatResponse(
            message=structural.violations[0],
            message_type="error",
            suggestions=structural.suggestions + generate_suggestions(state, errors=structural.violations)[:2],
        )

    # ── Step 5: Compliance check ─────────────────────────────────────────────
    compliance = check_compliance_for_action(action, params, state)
    if not compliance.valid:
        return ChatResponse(
            message=compliance.violations[0],
            message_type="error",
            suggestions=compliance.suggestions + generate_suggestions(state, errors=compliance.violations)[:2],
        )

    # ── Step 6: Execute the action ───────────────────────────────────────────
    try:
        new_state, log_entry = _dispatch(action, params, state)
    except Exception as exc:
        logger.exception("Building engine error: %s", exc)
        return ChatResponse(
            message=f"Something went wrong applying your change: {exc}",
            message_type="error",
            suggestions=generate_suggestions(state),
        )

    # ── Step 7: Generate suggestions ─────────────────────────────────────────
    suggs = generate_suggestions(new_state, last_action=action)

    # Compliance advisory (elevator etc.) — non-blocking
    compliance_post = check_compliance_for_action(action, params, new_state)
    suggs = list(dict.fromkeys(compliance_post.suggestions + suggs))[:4]

    # ── Build success message ────────────────────────────────────────────────
    msg = _success_message(action, params, new_state, cost_breakdown.total if cost_breakdown.total else 0)
    animation = AnimationHint(type=_ANIMATION_MAP.get(action, "update"), target=params)

    return ChatResponse(
        message=msg,
        message_type="success",
        updatedState=new_state,
        suggestions=suggs,
        actionLog=log_entry,
        animationHint=animation,
        costBreakdown=cost_breakdown if cost_breakdown.total > 0 else None,
    )


# ── Helpers ────────────────────────────────────────────────────────────────

def _dispatch(action: str, params: dict, state: BuildingState):
    if action == "add_floor":
        return engine.add_floor(state)
    elif action == "add_floors":
        return engine.add_floors(state, params.get("count", 1))
    elif action == "remove_floor":
        return engine.remove_floor(state, params["floor_number"])
    elif action == "add_rooms":
        return engine.add_rooms(state, params["floor_number"], params.get("count", 1))
    elif action == "remove_rooms":
        return engine.remove_rooms(state, params["floor_number"], params.get("count", 1))
    elif action == "add_typed_room":
        return engine.add_typed_room(state, params["floor_number"], params["room_type"], params.get("count", 1))
    elif action == "remove_typed_rooms":
        return engine.remove_typed_rooms(state, params["floor_number"], params["room_type"], params.get("count", 1))
    elif action == "set_budget":
        return engine.set_budget(state, params["amount"])
    elif action == "rename_room":
        return engine.rename_room(state, params["floor_number"], params.get("room_index", 0), params["name"])
    elif action == "reset_building":
        return engine.reset_building(state)
    else:
        raise ValueError(f"Unknown action: {action}")


def _success_message(action: str, params: dict, state: BuildingState, cost: int) -> str:
    remaining = format_cost(state.budget.remaining)
    spent = f" Cost: {format_cost(cost)}." if cost > 0 else ""
    if action == "add_floor":
        n = len(state.floors)
        return f"✅ Floor {n} added with 1 default room.{spent} Budget remaining: {remaining}."
    elif action == "add_floors":
        count = params.get("count", 1)
        return f"✅ Added {count} floor(s), each with 1 default room.{spent} Budget remaining: {remaining}."
    elif action == "remove_floor":
        return f"✅ Floor {params['floor_number']} removed. Floors renumbered. Budget remaining: {remaining}."
    elif action == "add_rooms":
        count = params.get("count", 1)
        floor_n = params["floor_number"]
        floor = next((f for f in state.floors if f.number == floor_n), None)
        total = len(floor.rooms) if floor else "?"
        return f"✅ Added {count} room(s) to Floor {floor_n} (now {total} rooms).{spent} Budget remaining: {remaining}."
    elif action == "remove_rooms":
        count = params.get("count", 1)
        floor_n = params["floor_number"]
        floor = next((f for f in state.floors if f.number == floor_n), None)
        total = len(floor.rooms) if floor else "?"
        return f"✅ Removed {count} room(s) from Floor {floor_n} (now {total} rooms). Budget remaining: {remaining}."
    elif action == "add_typed_room":
        rtype = params.get("room_type", "room").capitalize()
        count = params.get("count", 1)
        floor_n = params["floor_number"]
        floor = next((f for f in state.floors if f.number == floor_n), None)
        total = len(floor.rooms) if floor else "?"
        return f"✅ Added {count} {rtype}(s) to Floor {floor_n} (now {total} rooms).{spent} Budget remaining: {remaining}."
    elif action == "remove_typed_rooms":
        rtype = params.get("room_type", "room").capitalize()
        count = params.get("count", 1)
        floor_n = params["floor_number"]
        floor = next((f for f in state.floors if f.number == floor_n), None)
        total = len(floor.rooms) if floor else "?"
        return f"✅ Removed {count} {rtype}(s) from Floor {floor_n} (now {total} rooms). Budget remaining: {remaining}."
    elif action == "set_budget":
        return f"✅ Budget updated to {format_cost(params['amount'])}. Remaining: {remaining}."
    elif action == "rename_room":
        return f"✅ Room renamed to '{params['name']}'."
    elif action == "reset_building":
        return f"✅ Building reset. Fresh start with {format_cost(state.budget.total)} budget!"
    else:
        return "✅ Done!"


def _show_status(state: BuildingState) -> ChatResponse:
    n_floors = len(state.floors)
    n_rooms = sum(len(f.rooms) for f in state.floors)
    pct = int(state.budget.used / state.budget.total * 100) if state.budget.total else 0
    msg = (
        f"**Building Status**\n"
        f"• Floors: {n_floors} / {state.constraints.maxFloors}\n"
        f"• Rooms: {n_rooms} total\n"
        f"• Budget: {format_cost(state.budget.used)} used ({pct}%), "
        f"{format_cost(state.budget.remaining)} remaining\n"
    )
    if state.floors:
        msg += "• Floor breakdown: " + ", ".join(
            f"F{f.number}: {len(f.rooms)} rooms" for f in sorted(state.floors, key=lambda f: f.number)
        )
    return ChatResponse(
        message=msg,
        message_type="info",
        suggestions=generate_suggestions(state),
    )


def _format_suggestions_message(suggs: list[str], state: BuildingState) -> str:
    if not suggs:
        return "Your building looks great! No immediate improvements needed."
    return "Here are my suggestions:\n" + "\n".join(f"• {s}" for s in suggs)
