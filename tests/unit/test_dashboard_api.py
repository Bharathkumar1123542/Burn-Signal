"""Unit tests for Milestone 4: Dashboard API Service and Spec 5.3 View Queries."""

import pytest
from fastapi.testclient import TestClient

from services.dashboard_api.main import app

client = TestClient(app)


def test_api_summary_endpoint():
    """Verify GET /api/v1/summary returns district metrics."""
    response = client.get("/api/v1/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["district"] == "Sangrur, Punjab"
    assert data["total_plots_scored"] >= 9
    assert "active_clusters" in data
    assert "tasks_ready" in data
    assert "tasks_escalation" in data
    assert data["burn_score_threshold"] == 0.60


def test_api_plot_scores_endpoint():
    """Verify GET /api/v1/plot-scores returns scored plot records."""
    response = client.get("/api/v1/plot-scores")
    assert response.status_code == 200
    plots = response.json()
    assert len(plots) >= 9
    first = plots[0]
    assert "plot_id" in first
    assert "lat" in first and "lon" in first
    assert "burn_likelihood_score" in first
    assert "scoring_window_end" in first


def test_api_clusters_endpoint():
    """Verify GET /api/v1/clusters returns hotspot clusters."""
    response = client.get("/api/v1/clusters")
    assert response.status_code == 200
    clusters = response.json()
    assert len(clusters) >= 1
    c = clusters[0]
    assert "cluster_id" in c
    assert "centroid_lat" in c and "centroid_lon" in c
    assert "mean_score" in c
    assert "effective_deadline" in c


def test_api_worker_view_query():
    """Verify Worker View query: status='ready_for_delivery' and filtered by worker_id."""
    response = client.get("/api/v1/dispatch-tasks?worker_id=WORKER-SAN-01&status=ready_for_delivery")
    assert response.status_code == 200
    tasks = response.json()
    # All returned tasks must belong to WORKER-SAN-01 and be ready for delivery
    for t in tasks:
        assert t["worker_id"] == "WORKER-SAN-01"
        assert t["status"] == "ready_for_delivery"
        assert t["script_ref"] is not None
        assert t["equipment_ref"] is not None


def test_api_officer_escalation_view_query():
    """Verify District Officer View query: status='escalation_required'."""
    response = client.get("/api/v1/dispatch-tasks?status=escalation_required")
    assert response.status_code == 200
    tasks = response.json()
    for t in tasks:
        assert t["status"] == "escalation_required"
        # Per Architecture Principle 4, escalated tasks must have null equipment
        assert t["equipment_ref"] is None


def test_api_pcb_anonymized_view_no_pii():
    """Verify PCB view conforms to Spec 5.3 & NFR 9.4: strictly NO farmer PII."""
    response = client.get("/api/v1/pcb-anonymized-clusters")
    assert response.status_code == 200
    records = response.json()
    assert len(records) >= 1

    forbidden_pii_keys = {"farmer_name", "farmer_phone", "worker_phone", "worker_name", "script_text"}
    for r in records:
        assert "cluster_id" in r
        assert "centroid_lat" in r and "centroid_lon" in r
        assert "mean_score" in r
        assert "effective_deadline" in r
        # Confirm no PII keys exist in response
        for forbidden in forbidden_pii_keys:
            assert forbidden not in r


def test_api_pipeline_log_endpoint():
    """Verify GET /api/v1/pipeline-log/latest returns stage logs."""
    response = client.get("/api/v1/pipeline-log/latest")
    assert response.status_code == 200
    logs = response.json()
    assert len(logs) == 7
    stages = [l["stage"] for l in logs]
    assert "ingestion_satellite" in stages
    assert "scoring_service" in stages
    assert "dispatch_service" in stages
