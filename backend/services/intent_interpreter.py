"""
Intent Interpreter — MCP Tool: interpret_command

Uses Gemini API to parse natural language into structured actions.
Falls back to regex-based keyword parsing if Gemini is unavailable.
"""
import os
import re
import json
import asyncio
import logging
from typing import Optional

from models.building import BuildingState, InterpretedAction

logger = logging.getLogger(__name__)

GEMINI_SYSTEM_PROMPT = """You are a command interpreter for an AI Architect building planner app.
Parse the user's natural language command into a structured JSON action.

Supported room types: bedroom, bathroom, kitchen, hallway, office, store, general

Available actions:
- "add_floor"           — params: {}
- "add_floors"          — params: {"count": int}
- "remove_floor"        — params: {"floor_number": int}
- "add_rooms"           — params: {"floor_number": int, "count": int}
- "remove_rooms"        — params: {"floor_number": int, "count": int}
- "add_typed_room"      — params: {"floor_number": int, "room_type": str, "count": int}
- "remove_typed_rooms"  — params: {"floor_number": int, "room_type": str, "count": int}
- "get_suggestions"     — params: {}
- "show_status"         — params: {}
- "reset_building"      — params: {}
- "set_budget"          — params: {"amount": int}
- "rename_room"         — params: {"floor_number": int, "room_index": int, "name": str}
- "unknown"             — params: {"reason": str}

Rules:
- If the user says "add a floor" or "add another floor", use "add_floor".
- If the user says "add 3 floors", use "add_floors" with count 3.
- If the user says "add 2 rooms on floor 1", use "add_rooms" with floor_number=1, count=2.
- If the user mentions a specific room type like "add a bathroom to floor 2" or "add kitchen on floor 1",
  use "add_typed_room" with the matching room_type.
- Supported room types: bedroom, bathroom, kitchen, hallway, office, store, general.
- For budget amounts in lakh (e.g. "10 lakh"), convert to int (10 lakh = 1000000).
- If unclear, set clarification_needed=true and provide a helpful clarification_message.

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "action": "<action>",
  "params": {},
  "confidence": 0.95,
  "clarification_needed": false,
  "clarification_message": ""
}"""


def _keyword_fallback(message: str) -> InterpretedAction:
    """Regex-based fallback parser when Gemini is unavailable."""
    msg = message.lower().strip()

    # reset
    if re.search(r'\b(reset|start over|start fresh|new building|clear)\b', msg):
        return InterpretedAction(action="reset_building", params={})

    # show status
    if re.search(r'\b(status|show|display|current|info|summary)\b', msg) and not re.search(r'add|remove|suggest', msg):
        return InterpretedAction(action="show_status", params={})

    # suggestions
    if re.search(r'\b(suggest|recommend|improve|tip|advice|help)\b', msg):
        return InterpretedAction(action="get_suggestions", params={})

    # set budget  — "set budget to 20 lakh" / "change budget 2000000"
    budget_match = re.search(r'budget.*?(\d+)\s*(lakh|l\b)?', msg)
    if budget_match and re.search(r'set|change|update', msg):
        amount = int(budget_match.group(1))
        if budget_match.group(2):
            amount *= 100_000
        return InterpretedAction(action="set_budget", params={"amount": amount})

    # add N floors
    multi_floor = re.search(r'add\s+(\d+)\s+floors?', msg)
    if multi_floor and not re.search(r'with|bedroom|kitchen|washroom|bathroom|office|living|dining', msg):
        return InterpretedAction(action="add_floors", params={"count": int(multi_floor.group(1))})

    # add a floor with specific rooms — preset command like "add a floor with 2 bedrooms, 1 kitchen..."
    # Strategy: create the floor first, then we handle rooms via separate calls from the frontend.
    # The fallback simply creates the floor; the frontend should chain individual room additions.
    if re.search(r'add\s+(a\s+|an\s+|another\s+|1\s+)?floor\s+with', msg):
        return InterpretedAction(action="add_floor", params={})

    # add a floor (simple, no rooms)
    if re.search(r'add\s+(a\s+|an\s+|another\s+|1\s+)?floor', msg) and not re.search(r'room', msg):
        return InterpretedAction(action="add_floor", params={})

    # remove floor N
    rm_floor = re.search(r'remove\s+(floor\s*)?(\d+)|delete\s+(floor\s*)?(\d+)', msg)
    if rm_floor and re.search(r'floor', msg):
        n = rm_floor.group(2) or rm_floor.group(4)
        return InterpretedAction(action="remove_floor", params={"floor_number": int(n)})

    # add N rooms on floor M  /  add rooms to floor M
    add_rooms = re.search(
        r'add\s+(\d+)\s+rooms?\s+(?:on|to|in|at)\s+floor\s+(\d+)'
        r'|add\s+rooms?\s+(?:on|to|in|at)\s+floor\s+(\d+)',
        msg
    )
    if add_rooms:
        count = int(add_rooms.group(1)) if add_rooms.group(1) else 1
        floor_n = add_rooms.group(2) or add_rooms.group(3)
        return InterpretedAction(action="add_rooms", params={"floor_number": int(floor_n), "count": count})

    # remove N rooms from floor M
    rm_rooms = re.search(
        r'remove\s+(\d+)\s+rooms?\s+(?:from|on|in)\s+floor\s+(\d+)'
        r'|delete\s+(\d+)\s+rooms?\s+(?:from|on|in)\s+floor\s+(\d+)',
        msg
    )
    if rm_rooms:
        count = int(rm_rooms.group(1) or rm_rooms.group(3))
        floor_n = rm_rooms.group(2) or rm_rooms.group(4)
        return InterpretedAction(action="remove_rooms", params={"floor_number": int(floor_n), "count": count})

    # add typed room — "add a bathroom to floor 2" / "add kitchen on floor 1"
    ROOM_KEYWORDS = {
        "bedroom": ["bedroom", "bed room", "sleeping room"],
        "bathroom": ["bathroom", "bath room", "washroom", "toilet", "restroom", "wc"],
        "kitchen": ["kitchen", "kitchenette"],
        "hallway": ["hallway", "hall", "corridor", "passage"],
        "office": ["office", "work room", "study"],
        "store": ["store", "storage", "storeroom", "warehouse"],
        "general": ["room"],
    }
    typed_room_match = None
    detected_type = None
    for rtype, keywords in ROOM_KEYWORDS.items():
        for kw in keywords:
            pattern = (
                rf'add\s+(\d+)\s+{kw}s?\s+(?:to|on|in|at)\s+floor\s+(\d+)'
                rf'|add\s+(a|an)?\s*{kw}\s+(?:to|on|in|at)\s+floor\s+(\d+)'
                rf'|add\s+(\d+)?\s*{kw}s?\s+(?:to|on|in|at)\s+floor\s+(\d+)'
            )
            m = re.search(pattern, msg)
            if m:
                typed_room_match = m
                detected_type = rtype
                break
        if typed_room_match:
            break
    if typed_room_match and detected_type:
        groups = [g for g in typed_room_match.groups() if g is not None and g.isdigit()]
        count = 1
        floor_n = None
        if len(groups) >= 2:
            count = int(groups[0])
            floor_n = int(groups[1])
        elif len(groups) == 1:
            floor_n = int(groups[0])
        if floor_n is not None:
            return InterpretedAction(
                action="add_typed_room",
                params={"floor_number": floor_n, "room_type": detected_type, "count": count},
            )

    # remove typed room — "remove bathroom from floor 2"
    for rtype, keywords in ROOM_KEYWORDS.items():
        for kw in keywords:
            pattern = rf'remove\s+(\d+)?\s*{kw}s?\s+(?:from|on|in)\s+floor\s+(\d+)'
            m = re.search(pattern, msg)
            if m:
                count = int(m.group(1)) if m.group(1) else 1
                floor_n = int(m.group(2))
                return InterpretedAction(
                    action="remove_typed_rooms",
                    params={"floor_number": floor_n, "room_type": rtype, "count": count},
                )

    # generic "add rooms" without floor → clarification needed
    if re.search(r'add\s+\d*\s*rooms?', msg):
        return InterpretedAction(
            action="unknown",
            params={"reason": "floor number missing"},
            clarification_needed=True,
            clarification_message="Which floor should I add the rooms to? (e.g. 'add 2 rooms on floor 1')",
        )

    return InterpretedAction(
        action="unknown",
        params={"reason": "command not recognized"},
        clarification_needed=True,
        clarification_message="I didn't understand that. Try commands like 'add a floor', 'add bathroom to floor 1', or 'suggest improvements'.",
    )


def _building_summary(state: BuildingState) -> str:
    floors_info = ", ".join(
        f"Floor {f.number}: {len(f.rooms)} room(s)" for f in state.floors
    ) or "no floors yet"
    return (
        f"Floors: {len(state.floors)} total ({floors_info}). "
        f"Budget: ₹{state.budget.remaining:,} remaining of ₹{state.budget.total:,}. "
        f"Constraints: max {state.constraints.maxFloors} floors, "
        f"max {state.constraints.maxRoomsPerFloor} rooms/floor."
    )


async def interpret_command(message: str, state: BuildingState) -> InterpretedAction:
    """
    MCP Tool: interpret_command
    Input:  { userMessage, buildingState }
    Output: InterpretedAction
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.info("No GEMINI_API_KEY — using keyword fallback")
        return _keyword_fallback(message)

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=GEMINI_SYSTEM_PROMPT,
        )
        prompt = (
            f"Building context: {_building_summary(state)}\n\n"
            f"User command: {message}"
        )
        response = await asyncio.to_thread(
            model.generate_content,
            prompt,
            generation_config={"temperature": 0.1, "max_output_tokens": 256},
        )
        raw = response.text.strip()
        # Strip markdown fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        return InterpretedAction(**data)
    except Exception as exc:
        logger.warning("Gemini call failed (%s), using keyword fallback", exc)
        return _keyword_fallback(message)
