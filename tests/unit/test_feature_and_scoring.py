"""Unit tests for Milestone 2: Feature Engineering Pipeline and Scoring Service."""

import datetime
import pytest

from services.feature_pipeline.main import (
    compute_slope_7d,
    resolve_residue_signal,
    compute_crop_calendar_metrics,
    match_socioeconomic,
    generate_feature_row,
    run_feature_pipeline,
)
from services.scoring_service.main import (
    compute_propensity_score,
    score_plot_features,
    VertexPredictionClient,
    run_scoring_service,
)


def test_compute_slope_7d_trends():
    """Verify linear slope calculation over historical readings."""
    # Steadily increasing residue readings
    increasing = [
        {"reading_date": f"2026-10-0{i}", "residue_index": 0.1 * i}
        for i in range(1, 6)
    ]
    slope_pos = compute_slope_7d(increasing)
    assert slope_pos > 0.09

    # Flat residue readings
    flat = [
        {"reading_date": f"2026-10-0{i}", "residue_index": 0.45}
        for i in range(1, 5)
    ]
    slope_flat = compute_slope_7d(flat)
    assert abs(slope_flat) < 1e-4

    # Insufficient readings (< 2)
    assert compute_slope_7d([{"reading_date": "2026-10-01", "residue_index": 0.5}]) == 0.0
    assert compute_slope_7d([]) == 0.0


def test_resolve_residue_signal_carry_forward():
    """Verify 14-day carry-forward rule and degraded / excluded flagging."""
    run_date = datetime.date(2026, 10, 10)

    # 1. Fresh reading
    history_fresh = [
        {"reading_date": "2026-10-10", "residue_index": 0.55, "stale_imagery": False}
    ]
    val, conf = resolve_residue_signal(history_fresh, run_date)
    assert val == 0.55
    assert conf == "normal"

    # 2. Latest reading is stale, but 5 days ago had valid reading -> degraded
    history_stale_within_14 = [
        {"reading_date": "2026-10-10", "residue_index": None, "stale_imagery": True},
        {"reading_date": "2026-10-05", "residue_index": 0.48, "stale_imagery": False},
    ]
    val, conf = resolve_residue_signal(history_stale_within_14, run_date)
    assert val == 0.48
    assert conf == "degraded"

    # 3. Latest is stale, last valid reading was 20 days ago (>14 days) -> excluded
    history_expired = [
        {"reading_date": "2026-10-10", "residue_index": None, "stale_imagery": True},
        {"reading_date": "2026-09-15", "residue_index": 0.60, "stale_imagery": False},
    ]
    val, conf = resolve_residue_signal(history_expired, run_date)
    assert val is None
    assert conf == "excluded"


def test_crop_calendar_metrics():
    """Verify days since harvest and deadline pressure calculations."""
    run_date = datetime.date(2026, 10, 10)
    calendar = {
        "harvest_estimate_date": "2026-10-04",
        "sowing_deadline": "2026-11-05"
    }
    days_since_harvest, sowing_pressure = compute_crop_calendar_metrics(calendar, run_date)
    assert days_since_harvest == 6  # 10 - 4
    assert sowing_pressure == 26   # 5 Nov - 10 Oct = 26 days


def test_propensity_score_dynamics():
    """Verify propensity scoring logic and probability ranges."""
    # High risk profile: high residue, positive trend, urgent deadline, low subsidy
    high_risk_features = {
        "residue_index": 0.65,
        "residue_index_trend_7d": 0.08,
        "msp_realization_rate": 0.70,
        "subsidy_uptake_rate": 0.50,
        "days_since_harvest_estimate": 6,
        "sowing_deadline_pressure_days": 8,  # Urgent
        "plot_area_hectares": 4.5,
    }
    high_score = compute_propensity_score(high_risk_features)
    assert high_score > 0.65  # Expected high risk

    # Low risk profile: low residue, safe deadline, high subsidy uptake
    low_risk_features = {
        "residue_index": 0.05,
        "residue_index_trend_7d": -0.02,
        "msp_realization_rate": 0.95,
        "subsidy_uptake_rate": 0.90,
        "days_since_harvest_estimate": 1,
        "sowing_deadline_pressure_days": 35,
        "plot_area_hectares": 2.0,
    }
    low_score = compute_propensity_score(low_risk_features)
    assert low_score < 0.35
    assert 0.0 <= low_score <= 1.0


def test_72h_scoring_window_and_batching():
    """Verify that scoring creates exactly a 72-hour window and chunks correctly."""
    mock_features = [
        {
            "plot_id": f"PLOT-TEST-{i:03d}",
            "residue_index": 0.40,
            "residue_index_trend_7d": 0.02,
            "msp_realization_rate": 0.85,
            "subsidy_uptake_rate": 0.75,
            "days_since_harvest_estimate": 4,
            "sowing_deadline_pressure_days": 20,
            "plot_area_hectares": 3.0,
            "feature_confidence": "normal",
        }
        for i in range(12)
    ]

    now = datetime.datetime(2026, 10, 6, 8, 0, 0, tzinfo=datetime.timezone.utc)
    # Test batch size = 5 (will produce 3 batches: 5, 5, 2)
    scores = score_plot_features(mock_features, batch_size=5, scoring_time=now)
    assert len(scores) == 12

    for rec in scores:
        start = datetime.datetime.fromisoformat(rec["scoring_window_start"])
        end = datetime.datetime.fromisoformat(rec["scoring_window_end"])
        assert (end - start) == datetime.timedelta(hours=72)
        assert 0.0 <= rec["burn_likelihood_score"] <= 1.0
        assert rec["model_version"] == "burnsignal-automl-v1.0"


def test_milestone2_pipeline_end_to_end():
    """Verify full feature pipeline execution followed by scoring."""
    features = run_feature_pipeline(run_date=datetime.date(2026, 10, 6))
    assert len(features) > 0
    # Every feature row must conform to plot_features columns
    required_feature_keys = {
        "plot_id", "run_timestamp", "residue_index", "residue_index_trend_7d",
        "msp_realization_rate", "subsidy_uptake_rate", "days_since_harvest_estimate",
        "plot_area_hectares", "sowing_deadline_pressure_days", "feature_confidence"
    }
    assert all(required_feature_keys.issubset(f.keys()) for f in features)

    # Score features
    scores = run_scoring_service(features)
    assert len(scores) == len(features)
    required_score_keys = {
        "plot_id", "burn_likelihood_score", "scoring_window_start",
        "scoring_window_end", "model_version", "scored_at"
    }
    assert all(required_score_keys.issubset(s.keys()) for s in scores)
