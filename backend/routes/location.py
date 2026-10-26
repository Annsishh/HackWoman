from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from models.building import BOQBreakdown, BuildingState, ChatResponse
from orchestrator import set_location
from services.boq_estimator import estimate_boq
import services.building_engine as engine
import services.sor_rates as sor
from state.store import store

router = APIRouter()


class LocationRequest(BaseModel):
    """Either coordinates (GPS / map click) or a place name to search for."""
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    query: str | None = None
    source: Literal["gps", "search", "map", "coords"] = "coords"

    @model_validator(mode="after")
    def _one_of(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Send both lat and lng.")
        if self.lat is None and not (self.query or "").strip():
            raise ValueError("Send lat/lng or a query.")
        return self


@router.post("/location", response_model=ChatResponse)
async def set_site_location(req: LocationRequest) -> ChatResponse:
    """Set where the building is; the district then drives risk, simulations and regional cost."""
    params = {"lat": req.lat, "lng": req.lng} if req.lat is not None else {"query": req.query}
    response = await set_location(params, store.get(), source=req.source)
    if response.updatedState is not None:
        store.set(response.updatedState)
    return response


@router.get("/estimate/boq", response_model=BOQBreakdown)
async def get_boq() -> BOQBreakdown:
    """The current building priced line by line from the KPWD Schedule of Rates."""
    return estimate_boq(store.get())


class GstRequest(BaseModel):
    include: bool


@router.put("/estimate/gst", response_model=BuildingState)
async def set_gst(req: GstRequest) -> BuildingState:
    new_state, _ = engine.set_include_gst(store.get(), req.include)
    store.set(new_state)
    return new_state


@router.get("/rates/meta")
async def rates_meta() -> dict:
    """Which Schedule of Rates edition is in use, and which rates are still placeholders."""
    return sor.meta()


@router.get("/rates/search")
async def rates_search(q: str, limit: int = 20) -> list[dict]:
    """Search the parsed KPWD schedule (finished items and basic materials)."""
    if not q.strip():
        raise HTTPException(400, "Empty query.")
    return sor.search(q, min(max(limit, 1), 100))
