"""Unit tests for Milestone 3: Clustering Agent, Coordination Agent, and Dispatch Service."""

import datetime
from pathlib import Path
import pytest

from services.clustering_agent.main import (
    haversine_distance_meters,
    filter_high_risk_plots,
    cluster_plots_dbscan,
    run_clustering_agent,
)
from services.coordination_agent.main import (
    find_assigned_worker,
    find_nearest_available_equipment,
    coordinate_cluster_tasks,
    run_coordination_agent,
)
from services.dispatch_service.main import (
    format_residue_plain_language,
    build_gemini_tts_prompt,
    dispatch_task,
    GeminiTTSClient,
    run_dispatch_service,
)


def test_haversine_distance():
    """Verify haversine distance calculation."""
    # Same point -> 0 meters
    assert haversine_distance_meters(30.245, 75.835, 30.245, 75.835) == 0.0

    # Approx 1 km difference in latitude (1 deg lat approx 111 km)
    dist = haversine_distance_meters(30.240, 75.835, 30.249, 75.835)
    assert 900.0 < dist < 1100.0


def test_dbscan_clustering_grouping_and_aggregation():
    """Verify that DBSCAN groups adjacent plots and calculates centroid, score, and deadline."""
    # 3 plots close together (< 400m apart) in Sangrur
    cluster_plots = [
        {
            "plot_id": "PLOT-001",
            "latitude": 30.246,
            "longitude": 75.837,
            "burn_likelihood_score": 0.85,
            "scoring_window_end": "2026-10-09T10:00:00+00:00",
        },
        {
            "plot_id": "PLOT-002",
            "latitude": 30.247,
            "longitude": 75.838,
            "burn_likelihood_score": 0.75,
            "scoring_window_end": "2026-10-08T12:00:00+00:00",  # Earliest
        },
        {
            "plot_id": "PLOT-003",
            "latitude": 30.248,
            "longitude": 75.839,
            "burn_likelihood_score": 0.80,
            "scoring_window_end": "2026-10-09T14:00:00+00:00",
        },
        # 1 isolated plot far away (> 10 km)
        {
            "plot_id": "PLOT-FAR",
            "latitude": 30.400,
            "longitude": 75.950,
            "burn_likelihood_score": 0.90,
            "scoring_window_end": "2026-10-09T10:00:00+00:00",
        },
    ]

    clusters, members = cluster_plots_dbscan(cluster_plots, eps_meters=600, min_samples=3)

    # Expect 1 cluster formed with 3 members; isolated plot is noise (-1)
    assert len(clusters) == 1
    assert len(members) == 3
    clu = clusters[0]
    assert clu["member_count"] == 3
    assert 0.79 < clu["mean_score"] < 0.81  # Mean of 0.85, 0.75, 0.80 is 0.80
    assert clu["effective_deadline"] == "2026-10-08T12:00:00+00:00"  # Earliest deadline
    assert 30.246 < clu["centroid"]["latitude"] < 30.248


def test_kvk_worker_and_fallback_mapping():
    """Verify worker resolution and fallback to officer queue."""
    kvk_map = {
        "PB-SANGRUR-01": {"worker_id": "WORKER-01", "worker_name": "Rajinder"}
    }
    # Mapped block
    assigned_type, worker_id = find_assigned_worker("PB-SANGRUR-01", kvk_map)
    assert assigned_type == "kvk_worker"
    assert worker_id == "WORKER-01"

    # Unmapped block fallback
    assigned_type_fallback, worker_id_none = find_assigned_worker("PB-UNMAPPED-99", kvk_map)
    assert assigned_type_fallback == "district_officer_queue"
    assert worker_id_none is None


def test_find_nearest_available_equipment():
    """Verify equipment matching with distance and status filters."""
    inventory = [
        {
            "equipment_id": "EQP-NEAR-UNAVAIL",
            "latitude": 30.246,
            "longitude": 75.837,
            "status": "booked",  # Not available
        },
        {
            "equipment_id": "EQP-FAR-AVAIL",
            "latitude": 30.500,  # ~30 km away
            "longitude": 75.837,
            "status": "available",
        },
        {
            "equipment_id": "EQP-NEAR-AVAIL",
            "latitude": 30.250,  # ~500m away
            "longitude": 75.837,
            "status": "available",
        },
    ]

    # Query from (30.246, 75.837) with max 15km
    matched = find_nearest_available_equipment(30.246, 75.837, inventory, max_distance_km=15.0)
    assert matched is not None
    assert matched["equipment_id"] == "EQP-NEAR-AVAIL"


def test_coordination_agent_equipment_hold_and_escalation():
    """Verify coordination sets equipment to held and sets escalation when exhausted."""
    clusters = [
        {
            "cluster_id": "CLU-TEST-001",
            "effective_deadline": "2026-10-10T12:00:00+00:00",
        }
    ]
    members = [{"cluster_id": "CLU-TEST-001", "plot_id": "PLOT-PB-SAN-001"}]
    plots_registry = {
        "PLOT-PB-SAN-001": {
            "plot_id": "PLOT-PB-SAN-001",
            "block_code": "PB-SANGRUR-01",
            "centroid": {"latitude": 30.2465, "longitude": 75.8375},
        }
    }
    kvk_map = {
        "PB-SANGRUR-01": {"worker_id": "WORKER-SAN-01"}
    }

    # Case A: Equipment available -> pending_script, equipment held
    avail_eq = [
        {
            "equipment_id": "EQP-01",
            "latitude": 30.2470,
            "longitude": 75.8380,
            "status": "available",
            "slot_start": "2026-10-08 08:00:00 UTC",
        }
    ]
    tasks, updated_eq = coordinate_cluster_tasks(
        clusters, members, plots_registry, kvk_map, avail_eq, max_distance_km=15.0
    )
    assert len(tasks) == 1
    assert tasks[0]["status"] == "pending_script"
    assert tasks[0]["equipment_ref"] == "EQP-01"
    assert updated_eq[0]["status"] == "held"

    # Case B: No equipment available -> escalation_required
    no_eq: list = []
    tasks_esc, _ = coordinate_cluster_tasks(
        clusters, members, plots_registry, kvk_map, no_eq, max_distance_km=15.0
    )
    assert len(tasks_esc) == 1
    assert tasks_esc[0]["status"] == "escalation_required"
    assert tasks_esc[0]["equipment_ref"] is None


def test_gemini_tts_prompt_template_constraints():
    """Verify prompt formatting meets Section 5.2 constraints."""
    prompt = build_gemini_tts_prompt(
        farmer_name="Gurpreet Singh",
        plot_local_name="Wadda Khet",
        residue_level="high",
        equipment_type="happy_seeder",
        slot_time_local="8:00 AM tomorrow",
        location_desc="Sangrur Agro Hub",
        worker_name="Rajinder Sharma",
        worker_phone="+91-98140-55001",
        language_code="pa-IN",
    )
    # Must include farmer name, field, residue, equipment, and callback number
    assert "Gurpreet Singh" in prompt
    assert "Wadda Khet" in prompt
    assert "Rajinder Sharma" in prompt
    assert "+91-98140-55001" in prompt
    # Spoken length constraint: < 100 words (45s spoken)
    words = prompt.split()
    assert len(words) < 80


def test_dispatch_service_ready_for_delivery():
    """Verify dispatch_task transforms pending_script to ready_for_delivery."""
    task = {
        "task_id": "TASK-TEST-001",
        "plot_id": "PLOT-PB-SAN-001",
        "cluster_id": "CLU-TEST-001",
        "status": "pending_script",
        "equipment_ref": "EQP-001",
    }
    plots_reg = {
        "PLOT-PB-SAN-001": {
            "farmer_name": "Gurpreet Singh",
            "plot_local_name": "Field A",
            "block_code": "PB-SANGRUR-01",
            "baseline_ndvi": 0.72,
        }
    }
    kvk_map = {
        "PB-SANGRUR-01": {"worker_name": "Rajinder", "worker_phone": "+91-98000-00000"}
    }
    equipment_inv = {
        "EQP-001": {
            "equipment_id": "EQP-001",
            "equipment_type": "happy_seeder",
            "slot_start": "08:00 AM",
            "location_description": "Sangrur Hub",
        }
    }

    client = GeminiTTSClient()
    updated = dispatch_task(task, plots_reg, kvk_map, equipment_inv, tts_client=client)

    assert updated["status"] == "ready_for_delivery"
    assert updated["script_ref"].endswith(".mp3")
    assert "Gurpreet Singh" in updated["script_text"]


def test_milestone3_end_to_end_flow():
    """Verify full Milestone 3 flow from clustering to ready_for_delivery dispatch."""
    tasks = run_dispatch_service()
    assert len(tasks) > 0
    # Must produce tasks with ready_for_delivery or escalation_required
    statuses = {t["status"] for t in tasks}
    assert "ready_for_delivery" in statuses or "escalation_required" in statuses
    ready_tasks = [t for t in tasks if t["status"] == "ready_for_delivery"]
    if ready_tasks:
        assert ready_tasks[0]["script_ref"] is not None
        assert ready_tasks[0]["script_text"] is not None
