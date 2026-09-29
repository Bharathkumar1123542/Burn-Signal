"""Unit tests for Milestone 1: Config, Ingestion Service, and Socioeconomic Loader."""

import datetime
from pathlib import Path
import pytest

from services.common.config import BurnSignalConfig
from services.ingestion_satellite.main import (
    calculate_ndvi,
    calculate_residue_index,
    process_plot_reading,
    SatelliteClient,
    run_ingestion,
)
from services.loader_socioeconomic.main import (
    parse_socioeconomic_row,
    load_socioeconomic_csv,
    run_loader,
)


def test_config_defaults():
    """Verify default configuration values match implementation.md."""
    cfg = BurnSignalConfig()
    assert cfg.PILOT_DISTRICT_CODE == "PB-SANGRUR"
    assert cfg.BQ_DATASET_RAW == "burnsignal_raw"
    assert cfg.BQ_DATASET_SCORING == "burnsignal_scoring"
    assert cfg.BURN_SCORE_THRESHOLD == 0.6
    assert cfg.CLUSTER_EPS_METERS == 500
    assert cfg.CLUSTER_MIN_SAMPLES == 3
    assert cfg.TTS_LANGUAGE_CODE == "pa-IN"


def test_calculate_ndvi_bounds_and_values():
    """Verify NDVI calculations and edge conditions."""
    # Standard healthy vegetation: NIR=0.5, Red=0.1 -> (0.5-0.1)/(0.5+0.1) = 0.4/0.6 = 0.6667
    val = calculate_ndvi(0.5, 0.1)
    assert 0.66 < val < 0.67

    # Stubble / bare ground: NIR=0.2, Red=0.18 -> (0.2-0.18)/0.38 = 0.0526
    val_stubble = calculate_ndvi(0.2, 0.18)
    assert 0.05 < val_stubble < 0.06

    # Water / negative NDVI
    val_water = calculate_ndvi(0.05, 0.15)
    assert val_water < 0.0

    # Zero denominator
    assert calculate_ndvi(0.0, 0.0) == 0.0


def test_calculate_residue_index():
    """Verify residue differencing math."""
    # Baseline pre-harvest 0.75, post-harvest current 0.20 -> residue index 0.55
    residue = calculate_residue_index(0.75, 0.20)
    assert residue == 0.55

    # If field didn't change much: baseline 0.70, current 0.68 -> 0.02
    residue_low = calculate_residue_index(0.70, 0.68)
    assert residue_low == 0.02


def test_satellite_client_fallbacks():
    """Verify Sentinel-2 primary, Landsat-8 fallback, and stale imagery paths."""
    client = SatelliteClient(use_live_ee=False)
    today = datetime.date(2026, 10, 5)

    # 1. Clear sky (<20% cloud) -> Sentinel-2
    nir, red, sat, stale = client.fetch_plot_reflectance({}, today, simulated_cloud_pct=10.0)
    assert sat == "sentinel-2"
    assert not stale
    assert nir is not None and red is not None

    # 2. Moderate cloud (35%) -> Landsat-8 fallback
    nir, red, sat, stale = client.fetch_plot_reflectance({}, today, simulated_cloud_pct=35.0)
    assert sat == "landsat-8"
    assert not stale
    assert nir is not None and red is not None

    # 3. Dense cloud (80%) -> Stale imagery
    nir, red, sat, stale = client.fetch_plot_reflectance({}, today, simulated_cloud_pct=80.0)
    assert stale
    assert nir is None and red is None


def test_process_plot_reading_stale_handling():
    """Verify process_plot_reading correctly handles stale clouded imagery."""
    plot = {
        "plot_id": "PLOT-TEST-001",
        "baseline_ndvi": 0.72,
        "geometry": {}
    }
    today = datetime.date(2026, 10, 5)

    # Normal reading
    res_normal = process_plot_reading(plot, today, simulated_cloud_pct=5.0)
    assert res_normal["plot_id"] == "PLOT-TEST-001"
    assert res_normal["residue_index"] is not None
    assert not res_normal["stale_imagery"]

    # Obscured reading -> residue_index must be None, stale_imagery True
    res_stale = process_plot_reading(plot, today, simulated_cloud_pct=90.0)
    assert res_stale["residue_index"] is None
    assert res_stale["stale_imagery"] is True


def test_parse_socioeconomic_row_mapping():
    """Verify CSV mapping logic per msp_subsidy_schema.md."""
    raw_gov_row = {
        "sub_district_block": "PB-SANGRUR-01",
        "reporting_date": "2026-09-27",
        "msp_rate_pct": "0.90",
        "subsidy_utilization_pct": "0.85"
    }
    parsed = parse_socioeconomic_row(raw_gov_row, source_filename="test.csv")
    assert parsed is not None
    assert parsed["block_code"] == "PB-SANGRUR-01"
    assert parsed["as_of_date"] == "2026-09-27"
    assert parsed["msp_realization_rate"] == 0.90
    assert parsed["subsidy_uptake_rate"] == 0.85
    assert parsed["source_file"] == "test.csv"


def test_parse_socioeconomic_row_computed_fallback():
    """Verify computing ratios when percentage columns are absent."""
    raw_row = {
        "block_code": "PB-SANGRUR-02",
        "as_of_date": "2026-09-27",
        "procurement_actual_mt": "400000",
        "procurement_target_mt": "500000",
        "crm_machinery_disbursed": "75",
        "crm_machinery_sanctioned": "100"
    }
    parsed = parse_socioeconomic_row(raw_row, source_filename="computed.csv")
    assert parsed is not None
    assert parsed["msp_realization_rate"] == 0.80
    assert parsed["subsidy_uptake_rate"] == 0.75


def test_seed_data_files_and_full_runs():
    """Verify seed datasets load and execution cycles succeed end-to-end."""
    # Test Ingestion with real plot_registry.json seed
    readings = run_ingestion(run_date=datetime.date(2026, 10, 5))
    assert len(readings) == 10
    assert all("plot_id" in r and "reading_date" in r for r in readings)
    # At least one reading should be marked stale per simulated cloud pattern
    assert any(r["stale_imagery"] for r in readings)

    # Test Loader with real msp_subsidy_seed.csv
    socio_records = run_loader()
    assert len(socio_records) >= 6
    assert all(0.0 <= r["msp_realization_rate"] <= 1.0 for r in socio_records)
    assert all(0.0 <= r["subsidy_uptake_rate"] <= 1.0 for r in socio_records)
