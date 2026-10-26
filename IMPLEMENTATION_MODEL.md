# Implementation Plan: Replacing Hardcoded Formulas with a Trained Model

## 1. What's hardcoded today

**`materials_estimator.py`** — cost is pure arithmetic on fixed constants:
- `_FLOOR_CONCRETE/_STEEL/_GLASS` = flat shell cost per floor.
- Room material split is a fixed ratio of `cost_per_sqft` (60% concrete / 30% steel / 10% glass), regardless of room type, region, or material price trends.
- `_FOUNDATION_PER_FLOOR` scales linearly with building depth — a guess, not an engineering model.
- Demolition is a flat 20% of build cost for every action.

**`structural_inspector.py`** — a deterministic geometric rule: an upper floor cannot have more rooms than the floor below it. This is correctness-critical (it's enforcing "don't float a room in mid-air"), not a prediction problem — **this rule should stay hardcoded**. What's missing is any sense of *how close to failure* a design is (soil type, seismic zone, load distribution) — that's the gap worth filling with a model.

## 2. Where ML actually adds value (and where it shouldn't)

| Component | Replace with ML? | Why |
|---|---|---|
| Cost estimation (`materials_estimator.py`) | **Yes** | Genuine regression problem: cost depends on many correlated factors (region, room mix, height, material prices) that a fixed formula can't capture. Real "AI" story for judges. |
| Overhang/geometry check (`structural_inspector.py`) | **No — keep deterministic** | It's a hard physical invariant, not a statistical pattern. Replacing it with a model risks false negatives (approving an unsafe structure) for no real benefit. |
| Structural *risk scoring* (new, additive) | **Yes** | Add a `structural_risk_score()` that estimates failure/settlement risk from seismic zone, soil type, floor count, and load distribution — advisory only, surfaced via `suggestion_engine.py`, never blocking. |

So the plan has two tracks: **(A) replace cost estimation**, **(B) augment structural inspection with a risk score**, without touching the correctness-critical geometry rule.

## 3. Data

Real labeled datasets for Indian construction cost or structural failure are scarce. Two realistic options:

1. **Open datasets** (cost track): Kaggle "Construction Cost Estimation" / "House Price India" datasets, or CPWD / state PWD *Schedule of Rates* (SoR) PDFs — give real per-sqft rates by material and region that can be scraped/tabulated as ground truth.
2. **Synthetic generation grounded in engineering formulas** (both tracks, and the fastest path for a hackathon): write a generator script that samples realistic inputs (floors, rooms, room types, district from `karnataka_db.ts`, sqft) and labels them using the *existing* formulas plus randomized noise and region-based multipliers (e.g. seismic zone III districts get +8-15% foundation cost, coastal districts get +steel corrosion-protection cost). This gives you thousands of rows in minutes, and framing it as "trained on IS-1893-grounded synthetic engineering data" is honest and demo-friendly.

Recommended for the time budget: **start synthetic, enrich with a handful of real SoR data points if time allows.**

### Feature set

| Feature | Source |
|---|---|
| `num_floors`, `rooms_per_floor`, `total_sqft` | current `BuildingState` |
| `room_type_mix` (% bedroom/bathroom/kitchen/...) | `Room.type` |
| `district`, `seismic_zone`, `soil_type`, `wind_zone` | `karnataka_db.ts` (export to backend as JSON/CSV) |
| `material_price_index` (concrete/steel/glass unit rates) | static table now; swap for a live commodity-price API later |
| `action_type` (add/remove floor/room) | orchestrator params |
| *(stretch)* live `wind_speed`, `temperature`, `humidity` | weather API (ties into the earlier "make it dynamic" plan) |

## 4. Model choice

Tabular, small dataset, need speed + explainability + short training time → **gradient-boosted trees**, not deep learning.

- **Cost regression**: `XGBoost` or `LightGBM` regressor (or `RandomForestRegressor` from scikit-learn if you want zero extra dependencies). Target: `total_cost` (and optionally one model per material: concrete/steel/glass).
- **Structural risk score**: `GradientBoostingClassifier` / `XGBClassifier` outputting a 0-1 risk probability, trained on synthetic labels derived from a HAZUS/GEM-style lognormal seismic fragility function — `P(damage >= Moderate | Sa) = Phi(ln(Sa/Sa_median)/beta)` — rather than an arbitrary weighted-sum heuristic, so the label generator is the standard probabilistic damage-state model real seismic risk assessment uses, with capacity thresholds rescaled to fit India's IS 1893 zone PGA range. See `model/features.py`.

Why not deep learning: dataset will be small/synthetic, inference needs to be instant inside a chat response, and judges respond just as well to "trained a gradient-boosted model on 5,000 engineering-grounded samples" as to a neural net — with far less training/infra risk.

## 5. Training pipeline

```
backend/
└── ml/
    ├── generate_dataset.py     # synthetic data generator (track A + B)
    ├── train_cost_model.py     # trains + evaluates + serializes cost model
    ├── train_risk_model.py     # trains + evaluates + serializes risk model
    ├── models/
    │   ├── cost_model.joblib
    │   └── risk_model.joblib
    └── features.py             # shared feature-building functions
```

`generate_dataset.py` (skeleton):
```python
import pandas as np, numpy as np
from karnataka_districts import DISTRICTS  # exported from karnataka_db.ts

def sample_building():
    floors = np.random.randint(1, 10)
    rooms = [np.random.randint(1, 6) for _ in range(floors)]
    district = np.random.choice(DISTRICTS)
    return floors, rooms, district

def label_cost(floors, rooms, district):
    base = existing_formula(floors, rooms)          # reuse current logic as prior
    region_mult = district["cost_multiplier"]
    noise = np.random.normal(1.0, 0.05)
    return base * region_mult * noise

# repeat ~5-10k times -> pandas DataFrame -> CSV
```

`train_cost_model.py` (skeleton):
```python
import joblib
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
model = GradientBoostingRegressor(n_estimators=300, max_depth=4, learning_rate=0.05)
model.fit(X_train, y_train)
print("MAE:", mean_absolute_error(y_test, model.predict(X_test)))
joblib.dump(model, "models/cost_model.joblib")
```

Evaluation targets: MAE within ~5-10% of the old formula's output on held-out synthetic data (sanity check it hasn't diverged wildly), plus a few manual spot-checks against realistic SoR numbers.

## 6. Serving the model from FastAPI

Load once at startup, not per-request:

```python
# backend/services/materials_estimator.py
import joblib, os
from functools import lru_cache

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "models", "cost_model.joblib")

@lru_cache(maxsize=1)
def _load_model():
    if os.path.exists(_MODEL_PATH):
        return joblib.load(_MODEL_PATH)
    return None  # fallback to formula below

def estimate_materials_cost(action, params, current_state):
    model = _load_model()
    if model is not None:
        features = build_feature_vector(action, params, current_state)
        total = float(model.predict([features])[0])
        concrete, steel, glass = split_by_ratio(total)   # keep existing 60/30/10 split for the breakdown UI
        within_budget = total <= current_state.budget.remaining
        return MaterialsCostBreakdown(concrete=int(concrete), steel=int(steel), glass=int(glass), total=int(total)), within_budget
    # --- fallback: existing hardcoded formula, unchanged ---
    ...
```

Keeping the function signature identical means **`orchestrator.py` needs zero changes**, and the `model is None` fallback means the app still works if the model file is missing (good for a live demo — no "it crashed because the model didn't load" moment).

For the structural risk score, add a new, separate, non-blocking function:
```python
def structural_risk_score(state: BuildingState) -> float:
    model = _load_risk_model()
    if model is None:
        return 0.0
    return float(model.predict_proba([build_risk_features(state)])[0][1])
```
Call it from `suggestion_engine.py` to surface advisory copy like *"⚠️ Estimated 68% elevated settlement risk — Mysuru soil + 7 floors. Consider a raft foundation."* It never blocks an action; it only annotates suggestions.

## 7. Integration points

- `routes/building.py` / `orchestrator.py`: no changes needed (interfaces preserved).
- `suggestion_engine.py`: add the risk-score advisory line.
- New `/api/model-info` endpoint (optional, nice demo touch): returns model metadata (trained-on date, feature count, MAE) so you can show judges "here's the model card" live.
- Frontend `StatsPanel`/`ChatPanel`: surface the risk score and/or a "cost estimate powered by ML" badge — cheap visual payoff for the judging demo.

## 8. Suggested hackathon time budget

| Task | Time |
|---|---|
| Export `karnataka_db.ts` region data to backend-readable JSON | 20 min |
| Write `generate_dataset.py`, generate ~5-10k synthetic rows | 1 hr |
| Train + evaluate cost model | 45 min |
| Train + evaluate risk model | 45 min |
| Wire into `materials_estimator.py` / `suggestion_engine.py` with fallback | 1 hr |
| Frontend badge + demo polish | 30-45 min |

## 9. Risks & honest caveats

- Synthetic labels are *derived from* the current formulas, so the model will initially just be a smoothed, noisier version of them — the real differentiator is adding region/seismic/soil features the formulas never had, so the model's predictions diverge meaningfully across districts.
- Explainability: keep a `model-info`/SHAP-top-features note ready in case judges ask "why did it predict that" — gradient-boosted trees support this easily (`model.feature_importances_`).
- Retraining: any constraint change (max floors, room cost multipliers) requires regenerating data and retraining — document this so it doesn't bite post-hackathon.
