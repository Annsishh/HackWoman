# Implementation Plan: Location-Aware Parameters + KPWD Schedule of Rates Costing

## 1. Goal

Let the user say *where* they are building — their current location or any remote place — and have the app automatically:

1. Resolve that location to coordinates, an address and a Karnataka district.
2. Load the engineering parameters for that site (seismic zone, soil, wind, climate) and feed them into the ML risk/cost models and simulations.
3. Price the building from the **Karnataka PWD Schedule of Rates for Buildings 2023-24, Volume 2** instead of today's hardcoded constants (`_FLOOR_CONCRETE = 300_000` etc. in `materials_estimator.py`).

### User flows

| User does | Example |
|---|---|
| Asks for current location in chat | "use my current location", "I'm building here" |
| Names a remote place in chat | "build it in Mysuru", "plot near Hampi", "Udupi coast" |
| Gives coordinates | "12.9716, 77.5946" |
| Clicks on the satellite map | Location picker in the configuration modal (see §5.4) |

All four converge on the same `SiteLocation` object, so everything downstream is identical.

## 2. What the KPWD PDF actually contains (verified)

Source: `kpwd.karnataka.gov.in/storage/pdf-files/PWDSR-Vol-IIBuildings-GrandFinale-15-11-2023.pdf` — 326 pages, text-extractable (no OCR needed).

| Section | Page | Use in app |
|---|---|---|
| **Basic Cost of Materials** (~1,000 items: Sl No, description, unit, rate) | A-12 onward | Unit prices for quantities (blocks, glass, tiles, paint, timber, fittings) |
| **Finished item rates**, chapters 4–22 (item code, description, unit, rate) | 3–225 | Per-m² / per-m³ prices for whole work items |
| **Addendum II — CBRI weightages** of components (foundation 6.2%, roof 23.8%, joinery 16%, …) | 227 | Splitting a total into a readable cost breakdown |
| **Addendum II — material quantities vs plinth area** (statistical relations for 1-, 2-, 4-storey buildings) | 228–229 | Turning building size into material quantities |
| **Cement coefficients** per concrete grade (M20 = 320 kg/m³, M25 = 340, M30 = 360) | A-6 | Concrete → cement quantity |
| Steel bar mass table (IS 1786) | A-5/A-6 | Reinforcement weight |

Sample rows (as printed):

| Code | Item | Unit | Rate (₹) |
|---|---|---|---|
| 6.32 | Load-bearing solid concrete block wall 400×200×200, CM 1:4 | m² | 1,310 |
| 6.33 | Same, 400×150×200 | m² | 1,231 |
| 8.10 | 6 mm cement plaster 1:3 on concrete / ceilings | m² | 211 |
| 9.12.2 | Vitrified floor tiles 600×600 on 20 mm CM 1:4 | m² | 1,145 |
| Basic #781 | Solid concrete block 400×200×200 | No | 47 |
| Basic #614 | Plywood sheet | m² | 636 |
| Basic #1013 | Vitrified floor tile 60×60 (material only) | m² | 550 |

Plinth-area relations, double-storey column (A = total plinth area of all storeys, m²):

| Material | Relation |
|---|---|
| Cement (t) | 0.145A + 0.54 |
| Steel (kg) | 21.97A − 305 |
| Sand (m³) | 0.43A − 5.6 |
| Glass panes (m²) | 0.047A |

Worked example — 2 storeys × 100 m² (A = 200): cement 29.5 t (≈ 591 bags), steel ≈ 4,089 kg, sand ≈ 80 m³, glass ≈ 9.4 m².

### Gaps and caveats we must handle

1. **Cement, steel, sand, aggregate and concrete rates are not in Vol 2.** The preface says cement & steel basic rates are published quarterly, and earthwork, concrete and mortar are in **Vol 1 (Common/UNI SR)**. We need Vol 1 (or the current quarterly notification) for these. Until then the values are config placeholders, clearly labelled as such in the UI.
2. **Area Specific Loading (ASL)** — the per-region percentage added to finished rates — is also in **Vol 1**. Vol 2 rates are based on the **Bangalore division**, so ASL is how location changes cost. This is the key location → cost link.
3. Rates **exclude GST** (preface item 3) → add an explicit, toggleable 18% line.
4. Finished rates already include 1% sundries, 1% water, 10% overhead and 10% contractor profit → don't add these again.
5. The plinth-area relations are valid for **30–300 m² per dwelling, up to 4 storeys** (note on page 229). Outside that range we extrapolate and flag the estimate as approximate.
6. The SR applies **only within Karnataka** (preface item 26). Outside Karnataka: warn, and offer the nearest district or estimate without SR backing.
7. PDF table text extracts with jumbled columns (e.g. one sand relation reads `397A – 0.76`, clearly `0.397A`). **Every relation and the ~40 core rates we use must be hand-checked against the printed page**, with the page number stored alongside each value.

## 3. Architecture

```
chat / map click / GPS
        │
        ▼
location_resolver ──► SiteLocation {lat, lng, address, district_id, source}
        │
        ├──► site_parameters ──► seismic / soil / wind / climate  ──► ML risk model, simulations
        │
        └──► sor_rates (ASL for district) ──► boq_estimator ──► BOQ + total cost ──► budget gate
```

### 3.1 Location resolution — `backend/services/location_resolver.py`

| Input | Method |
|---|---|
| Coordinates (GPS, map click, typed) | Use directly |
| Place name | Forward geocode via **OpenStreetMap Nominatim** (server-side, identifying User-Agent, ≤1 request/s, results cached in-process) with a Karnataka bias (`countrycodes=in`, viewbox) |
| Coordinates → district | **Point-in-polygon** against `backend/data/karnataka_districts.geojson` using `shapely` (exact, offline, no name-matching issues) |
| District not in our 15-district DB | Fall back to the nearest supported district by centroid, and say so in the response |
| Outside Karnataka | Return a warning (`in_karnataka: false`) |

Output model (in `models/building.py`):

```python
class SiteLocation(BaseModel):
    lat: float
    lng: float
    address: str = ""
    district_id: str
    in_karnataka: bool = True
    source: Literal["gps", "search", "map", "coords"]
    approximated: bool = False   # True when we fell back to the nearest district
```

`Constraints` gains `site: Optional[SiteLocation] = None`. `district_id` stays the single field the ML models read, and is set from `site.district_id`.

### 3.2 Site parameters — `backend/services/site_parameters.py`

- **Static, authoritative:** seismic zone, PGA, soil, wind speed, terrain and climate zone from `model/districts.json` (already loaded by `ml_loader.get_district`). These remain the **only ML features**, so predictions stay deterministic and match training.
- **Live, display-only (optional):** **Open-Meteo** (free, no key) for current temperature, rainfall and wind, plus elevation. Shown in the Site card and thermal simulation; never fed to the models.

### 3.3 Rates data — `backend/data/sor/`

Built once by `scripts/parse_kpwd_sor.py` (`pypdf` text extraction + regex):

| File | Contents |
|---|---|
| `materials.json` | `[{sl_no, description, unit, rate, page}]` — Basic Cost of Materials |
| `items.json` | `[{code, chapter, description, unit, rate, page}]` — finished items (≈500 rows ending in `m2 <rate>`, plus m³/No/kg) |
| `quantity_relations.json` | **Hand-transcribed and verified** plinth-area relations (single / double / four-storey), with page refs |
| `core_rates.json` | The ~40 rates the estimator actually uses, verified by hand, each with `{code or sl_no, page, verified_by}`; cement/steel/sand/aggregate entries marked `source: "placeholder — Vol 1 / quarterly"` until filled |
| `area_specific_loading.json` | District → ASL %, from **Vol 1** (to be sourced) |

`backend/services/sor_rates.py` exposes `rate(code)`, `basic(sl_no)`, `asl(district_id)` and `meta()` (edition, date, GST note).

### 3.4 Cost engine — `backend/services/boq_estimator.py`

From `BuildingState`:

1. **Plinth area per floor** = Σ room `area_sqft` ÷ 10.764 ÷ 0.80. Room areas are carpet area; the 0.80 carpet-to-plinth factor for walls and circulation is a documented assumption. A = sum over floors.
2. **Pick the relation set** by floor count: 1 → single, 2–3 → double (interpolated), 4+ → four-storey (flagged approximate above 4 storeys or 300 m²).
3. **Quantities:** cement (t → 50 kg bags), steel (kg), sand (m³), coarse aggregate (m³), glass (m²), paint/primer (L), blocks (count from wall area).
4. **Price** quantities with `core_rates.json`; price finishes from finished items (e.g. flooring = room area × 9.12.2, plaster = wall area × 8.10, masonry = wall area × 6.33).
5. **Location:** apply `asl(district_id)` % to the finished-rate subtotal.
6. **GST:** optional 18% line.
7. **Output** a `BOQBreakdown` with line items (`code, description, qty, unit, rate, amount, page`), plus the existing `concrete / steel / glass / total` fields so `MaterialsCostBreakdown` consumers keep working.

Per-action cost = BOQ(after action) − BOQ(before action). This replaces the fixed per-floor constants and makes "add a floor" cost depend on size, location and storey count. Demolition keeps the 20% rule unless chapter 19 (Dismantling & Demolition) items are wired in later.

**Relationship to the ML cost model:** the BOQ becomes the primary, explainable estimate. `model/generate_dataset.py` is switched to label samples with `boq_estimator`, and the cost model is retrained, so the model learns SR-grounded costs rather than the old constant formula. `materials_estimator.estimate_materials_cost` order becomes **BOQ → ML → legacy formula**.

## 4. API and orchestrator changes

| Change | Detail |
|---|---|
| New intent `set_location` | params `{query}` \| `{lat, lng}` \| `{use_current: true}`. Add to the Gemini prompt in `intent_interpreter.py`, plus regex fallbacks: `\b(my|current) location\b`, `\bhere\b`, `\b(build|plot|site) (in|at|near) (.+)`, and a lat/lng pattern |
| `ChatResponse.clientAction` | New optional field. For `use_current`, the server can't know where the user is, so it returns `clientAction: "request_geolocation"`; the frontend asks the browser and calls the endpoint below |
| `POST /api/location` | Body `{lat, lng, source}` or `{query}` → resolves, updates `constraints.site` / `district_id`, re-runs risk, returns `{site, parameters, updatedState, structuralRisk}` |
| `GET /api/estimate/boq` | Current building's full BOQ with SR item references |
| `GET /api/rates/meta` | SR edition, date, GST/ASL notes, list of placeholder rates |
| Orchestrator | `set_location` skips the budget/structure gates; after it, re-run the budget check on the existing building, since location changes cost via ASL. Warn if the building now exceeds budget |

## 5. Frontend changes

1. **Chat (`ChatPanel.tsx`):** on `clientAction === "request_geolocation"`, call `navigator.geolocation.getCurrentPosition` and POST `/api/location` with `source: "gps"`. On permission denied, reply "Location blocked — type a place name instead".
2. **`BuildingContext`:** add `site`, and map the backend `district_id` to `karnataka_db` via `getDistrictById` → `SET_DISTRICT`, so simulations and the risk badge update automatically.
3. **`StatsPanel.tsx`:**
   - **Site card** — address, district, coordinates, live weather.
   - **Bill of quantities card** — top line items with SR codes ("KPWD SR 2023-24 · 9.12.2 · p.134"), cement bags, steel kg, ASL %, GST toggle, and a "placeholder rate" badge where Vol 1 values are missing.
4. **Location picker:** satellite map (Leaflet + Esri World Imagery) in `ConfigurationModal.tsx`, as planned earlier; it calls the same `/api/location`.

## 6. Phases

| # | Phase | Est. | Done when |
|---|---|---|---|
| 1 | Parse PDF → `materials.json`, `items.json`; hand-verify `core_rates.json` + `quantity_relations.json` | 3–4 h | Every value used has a page ref; spot-check of 20 rows matches the PDF |
| 2 | `boq_estimator` + `sor_rates`, wired into `materials_estimator` (BOQ → ML → formula) | 3 h | Unit tests reproduce the worked example (A = 200 m² → ≈ 29.5 t cement, ≈ 4,089 kg steel) |
| 3 | `location_resolver` + `/api/location` + district GeoJSON | 2–3 h | Mysuru, Mangaluru and raw coordinates resolve to the right `district_id`; a point outside Karnataka returns a warning |
| 4 | `set_location` intent + `clientAction` geolocation flow | 2 h | "use my current location" and "build in Udupi" both update the district, risk badge and simulations |
| 5 | Frontend Site + BOQ cards | 2–3 h | BOQ lines show SR codes; changing location changes cost through ASL |
| 6 | Retrain cost model on BOQ-labelled data | 1–2 h | `cost_model.meta.json` notes SR-based labels; model and BOQ agree within tolerance |
| 7 | Obtain Vol 1 (ASL table, cement/steel/concrete rates), replace placeholders | depends on source | No placeholder badges remain |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Vol 1 not available in time | Ship with clearly labelled placeholders; location then still drives risk and simulations, and cost varies by district only once ASL is filled |
| PDF parsing errors in tables | Use parsed data only for browsing/search; the estimator uses only the hand-verified `core_rates.json` |
| Nominatim rate limits / downtime | In-process cache, ≤1 request/s, and offline point-in-polygon for map/GPS input (no geocoding needed) |
| Relations outside their valid range | Clamp + "approximate" flag in the response and UI |
| Rates go stale (quarterly cement/steel) | `rates/meta` shows edition and date; rate files are versioned so a new SR is a data swap, not a code change |

## 8. Demo script

1. Type **"use my current location"** → the browser asks permission → "Site set: Bengaluru Urban (Zone II, hard soil)".
2. **"add 2 floors with 3 bedrooms and a kitchen"** → the BOQ card shows ≈ cement bags, steel kg and flooring at KPWD item 9.12.2, ₹1,145/m².
3. **"actually, build it in Mangaluru"** → the district switches, the risk badge turns amber (coastal wind/cyclone), and cost changes through Mangaluru's ASL.
4. Open **Simulations** → the cards now reflect Mangaluru.

## 9. Implementation status (2026-10-26)

| Phase | Status | Where |
|---|---|---|
| 1 Parse PDF + verified rate files | ✅ Done | `backend/scripts/parse_kpwd_sor.py` → `backend/data/sor/items.json` (1,175 items), `materials.json` (906); hand-checked `core_rates.json`, `quantity_relations.json` (formula table checked against the rendered pages 228–229) |
| 2 BOQ estimator | ✅ Done | `services/boq_estimator.py`, `services/sor_rates.py`; budget `used` = BOQ total (`building_engine._recalculate_budget`); per-action cost = BOQ after − before (`materials_estimator`, order BOQ → ML → formula) |
| 3 Location resolution + API | ✅ Done | `services/location_resolver.py`, `routes/location.py` (`POST /api/location`, `GET /api/estimate/boq`, `PUT /api/estimate/gst`, `GET /api/rates/meta`, `GET /api/rates/search`) |
| 4 `set_location` intent + geolocation | ✅ Done | `intent_interpreter.py` (Gemini prompt + keyword fallback), `orchestrator.set_location`, `ChatResponse.clientAction` |
| 5 Frontend Site + BOQ cards | ✅ Done | `components/stats/SiteCard.tsx`, `BoqCard.tsx` (replaces the fixed 45/32/23% split), chat geolocation flow, live weather/quakes and 3D-view coordinates follow the exact site |
| 6 Retrain cost model on BOQ labels | ⏳ Not started | The ML model is now only a fallback when an action can't be previewed |
| 7 Vol 1 rates (ASL, cement, steel, sand, aggregate, wages) | ⏳ Blocked on the document | Fill `core_rates.json` placeholders and `area_specific_loading.json` |

### Deviations from the plan above

- **District lookup** uses Nominatim's administrative names (reverse geocode) matched against an alias table, with nearest-district-HQ fallback, instead of a district GeoJSON + `shapely`. No new dependency or boundary dataset; precision is at the level OpenStreetMap reports.
- **Live weather** stays in the browser (`services/liveData.ts`, which already called Open-Meteo); it now uses the site coordinates rather than adding a backend copy.
- **Pricing method**: the CBRI plinth-area relations price the whole shell (materials + labour, then the SR's 1% + 1% + 10% + 10% add-ons). Finished items are used only for what the relations exclude (flooring, sanitary fittings, waterproofing) — pricing masonry/plaster items as well would count their cement and sand twice.
- **Carpet → plinth conversion** isn't needed: floors already carry their built-up area (`Floor.area_sqft`).
- **Four-storey (RCC-framed) relations are not used** — valid only to 100 m² total and they go negative beyond it; 3+ storeys extend the double-storey relation and are flagged approximate.
- **Regional adjustment** uses the existing seismic/soil/wind premium (`model/features.py`) as a labelled interim until Vol 1 ASL figures are entered.
- **Map location picker** (Leaflet + satellite tiles) is not built yet; the Site card offers place search and "use my location".
