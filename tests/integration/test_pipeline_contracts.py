"""Integration tests for BigQuery data contracts and fallback failure modes (Implementation.md Section 7)."""

import pytest
from orchestration.run_pipeline import run_pipeline
from services.coordination_agent.main import find_assigned_worker, find_nearest_available_equipment, coordinate_cluster_tasks


def test_full_pipeline_orchestration_run_log_contract():
    """Verify that end-to-end orchestrated pipeline produces valid pipeline_run_log entries."""
    logs = run_pipeline()
    assert len(logs) == 7

    # Verify every stage succeeded
    for stage_log in logs:
        assert stage_log["status"] == "success"
        assert stage_log["run_id"].startswith("RUN-")
        assert stage_log["rows_out"] > 0
        assert "start_time" in stage_log and "end_time" in stage_log

    stages = [l["stage"] for l in logs]
    assert stages == [
        "stage_01_ingest_satellite",
        "stage_02_loader_socioeconomic",
        "stage_03_feature_pipeline",
        "stage_04_scoring_service",
        "stage_05_clustering_agent",
        "stage_06_coordination_agent",
        "stage_07_dispatch_service",
    ]


def test_fallback_unmapped_kvk_worker_routing():
    """Verify fallback mode: Cluster in unmapped block routes to district_officer_queue."""
    assignment_type, worker_id = find_assigned_worker("PB-UNMAPPED-REGION", {})
    assert assignment_type == "district_officer_queue"
    assert worker_id is None


def test_fallback_exhausted_equipment_escalation():
    """Verify Architecture Principle 4: Tasks with no equipment are flagged escalation_required and have null equipment_ref."""
    clusters = [{"cluster_id": "CLU-FAIL-01", "effective_deadline": "2026-10-10T12:00:00+00:00"}]
    members = [{"cluster_id": "CLU-FAIL-01", "plot_id": "PLOT-PB-SAN-001"}]
    plots = {
        "PLOT-PB-SAN-001": {
            "plot_id": "PLOT-PB-SAN-001",
            "block_code": "PB-SANGRUR-01",
            "centroid": {"latitude": 30.2465, "longitude": 75.8375},
        }
    }
    kvk_map = {"PB-SANGRUR-01": {"worker_id": "W-01"}}
    empty_equipment: list = []

    tasks, _ = coordinate_cluster_tasks(clusters, members, plots, kvk_map, empty_equipment)
    assert len(tasks) == 1
    task = tasks[0]
    assert task["status"] == "escalation_required"
    assert task["equipment_ref"] is None
