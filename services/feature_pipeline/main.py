"""Feature Engineering Pipeline (Implementation.md Section 3.3).

Joins plot_residue_readings (daily) with block_socioeconomic (weekly) via block_code,
computes 7-day residue slope, crop calendar pressure metrics, handles stale imagery
carry-forward (within 14 days, setting feature_confidence='degraded'), and outputs to plot_features.
"""

from __future__ import annotations

import datetime
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# Enable direct script execution
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.common.config import config

logger = logging.getLogger("feature_pipeline")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def compute_slope_7d(readings: List[Dict[str, Any]]) -> float:
    """Compute the linear slope of residue_index over the last available readings (up to 7).

    Returns slope as float. If fewer than 2 valid readings exist, returns 0.0.
    """
    valid_points: List[Tuple[float, float]] = []
    # Assumes readings are sorted chronologically or sort by reading_date
    sorted_readings = sorted(readings, key=lambda r: r.get("reading_date", ""))

    for idx, r in enumerate(sorted_readings[-7:]):
        val = r.get("residue_index")
        if val is not None:
            valid_points.append((float(idx), float(val)))

    if len(valid_points) < 2:
        return 0.0

    x = np.array([p[0] for p in valid_points], dtype=float)
    y = np.array([p[1] for p in valid_points], dtype=float)

    # Linear regression slope: cov(x, y) / var(x)
    var_x = np.var(x)
    if np.isclose(var_x, 0.0):
        return 0.0
    slope = float(np.cov(x, y)[0, 1] / var_x)
    return round(slope, 4)


def resolve_residue_signal(
    readings_history: List[Dict[str, Any]],
    run_date: datetime.date,
) -> Tuple[Optional[float], str]:
    """Resolve residue index handling 14-day carry-forward.

    Returns: (residue_index, feature_confidence)
    - If latest reading is fresh: (val, "normal")
    - If latest reading is stale, carries forward last non-stale within 14 days: (val, "degraded")
    - If no non-stale reading within 14 days: (None, "excluded")
    """
    if not readings_history:
        return None, "excluded"

    # Sort descending by date
    sorted_history = sorted(
        readings_history,
        key=lambda r: r.get("reading_date", ""),
        reverse=True
    )

    latest = sorted_history[0]
    if not latest.get("stale_imagery", False) and latest.get("residue_index") is not None:
        return float(latest["residue_index"]), "normal"

    # Find last non-stale reading within 14 days
    for past in sorted_history:
        if not past.get("stale_imagery", False) and past.get("residue_index") is not None:
            past_date_str = past.get("reading_date")
            if past_date_str:
                past_date = datetime.date.fromisoformat(past_date_str)
                delta_days = (run_date - past_date).days
                if delta_days <= 14:
                    return float(past["residue_index"]), "degraded"

    # Exclude plot if no non-stale value exists within 14 days (spec 3.3 step 2)
    return None, "excluded"


def compute_crop_calendar_metrics(
    crop_calendar: Dict[str, Any],
    run_date: datetime.date,
) -> Tuple[int, int]:
    """Calculate days_since_harvest_estimate and sowing_deadline_pressure_days."""
    harvest_str = crop_calendar.get("harvest_estimate_date")
    sowing_deadline_str = crop_calendar.get("sowing_deadline")

    days_since_harvest = 0
    if harvest_str:
        harvest_date = datetime.date.fromisoformat(harvest_str)
        days_since_harvest = max(0, (run_date - harvest_date).days)

    sowing_deadline_pressure = 30  # Default baseline
    if sowing_deadline_str:
        deadline_date = datetime.date.fromisoformat(sowing_deadline_str)
        # Remaining days until deadline: smaller or negative indicates high pressure
        sowing_deadline_pressure = max(0, (deadline_date - run_date).days)

    return days_since_harvest, sowing_deadline_pressure


def match_socioeconomic(
    block_code: str,
    socioeconomic_records: List[Dict[str, Any]],
    run_date: datetime.date,
) -> Tuple[float, float]:
    """Find the most recent socioeconomic metrics for block_code on or before run_date."""
    matching = [
        rec for rec in socioeconomic_records
        if rec.get("block_code") == block_code and
        datetime.date.fromisoformat(rec["as_of_date"]) <= run_date
    ]
    if not matching:
        # Fallback to any record for this block
        matching = [rec for rec in socioeconomic_records if rec.get("block_code") == block_code]

    if matching:
        # Sort by as_of_date descending
        matching.sort(key=lambda r: r["as_of_date"], reverse=True)
        latest = matching[0]
        return float(latest.get("msp_realization_rate", 0.80)), float(latest.get("subsidy_uptake_rate", 0.70))

    return 0.80, 0.70


def generate_feature_row(
    plot: Dict[str, Any],
    readings_history: List[Dict[str, Any]],
    socioeconomic_records: List[Dict[str, Any]],
    run_date: datetime.date,
) -> Optional[Dict[str, Any]]:
    """Generate a single row conforming to schemas/bigquery_ddl/plot_features.sql."""
    plot_id = plot["plot_id"]
    block_code = plot.get("block_code", "")

    # Resolve residue signal and confidence
    residue_val, confidence = resolve_residue_signal(readings_history, run_date)
    if confidence == "excluded" or residue_val is None:
        logger.info("Plot %s excluded from run (no valid residue signal within 14 days)", plot_id)
        return None

    # Compute 7-day slope
    trend_7d = compute_slope_7d(readings_history)

    # Match socioeconomic signals
    msp_rate, subsidy_rate = match_socioeconomic(block_code, socioeconomic_records, run_date)

    # Crop calendar metrics
    crop_cal = plot.get("crop_calendar", {})
    days_since_harvest, sowing_pressure = compute_crop_calendar_metrics(crop_cal, run_date)

    plot_area = float(plot.get("plot_area_hectares", 2.5))

    return {
        "plot_id": plot_id,
        "run_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "residue_index": residue_val,
        "residue_index_trend_7d": trend_7d,
        "msp_realization_rate": msp_rate,
        "subsidy_uptake_rate": subsidy_rate,
        "days_since_harvest_estimate": days_since_harvest,
        "plot_area_hectares": plot_area,
        "sowing_deadline_pressure_days": sowing_pressure,
        "feature_confidence": confidence,
    }


def run_feature_pipeline(
    plots: Optional[List[Dict[str, Any]]] = None,
    readings: Optional[List[Dict[str, Any]]] = None,
    socioeconomic: Optional[List[Dict[str, Any]]] = None,
    run_date: Optional[datetime.date] = None,
) -> List[Dict[str, Any]]:
    """Execute feature engineering pipeline for active plots."""
    if run_date is None:
        run_date = datetime.date(2026, 10, 6)

    # Load defaults from seed files if not provided
    seed_dir = Path(__file__).resolve().parents[2] / "data" / "registry_seed"
    if plots is None:
        with open(seed_dir / "plot_registry.json", "r", encoding="utf-8") as f:
            plots = json.load(f)

    if socioeconomic is None:
        from services.loader_socioeconomic.main import run_loader
        socioeconomic = run_loader(seed_dir / "msp_subsidy_seed.csv")

    if readings is None:
        from services.ingestion_satellite.main import run_ingestion
        readings = run_ingestion(run_date=run_date)

    # Group readings by plot_id
    readings_by_plot: Dict[str, List[Dict[str, Any]]] = {}
    for r in readings:
        readings_by_plot.setdefault(r["plot_id"], []).append(r)

    feature_rows = []
    for plot in plots:
        pid = plot["plot_id"]
        history = readings_by_plot.get(pid, [])
        feature_row = generate_feature_row(plot, history, socioeconomic, run_date)
        if feature_row:
            feature_rows.append(feature_row)

    logger.info("Feature engineering pipeline produced %d feature rows.", len(feature_rows))
    return feature_rows


if __name__ == "__main__":
    features = run_feature_pipeline()
    print(f"Sample generated feature row: {json.dumps(features[0], indent=2)}")
