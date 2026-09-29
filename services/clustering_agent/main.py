"""Hotspot Clustering Agent (Implementation.md Section 3.5).

Filters plots with burn_likelihood_score >= BURN_SCORE_THRESHOLD and active scoring windows,
runs spatial DBSCAN clustering over plot centroids, and produces hotspot_clusters and
hotspot_cluster_members records conforming to schemas/bigquery_ddl/hotspot_clusters.sql.
"""

from __future__ import annotations

import datetime
import json
import logging
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.cluster import DBSCAN

# Enable direct script execution
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.common.config import config

logger = logging.getLogger("clustering_agent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

EARTH_RADIUS_METERS = 6371000.0


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two coordinates."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def filter_high_risk_plots(
    plot_scores: List[Dict[str, Any]],
    threshold: float,
    current_time: Optional[datetime.datetime] = None,
) -> List[Dict[str, Any]]:
    """Select plots where burn_likelihood_score >= threshold and scoring_window_end >= current_time."""
    if current_time is None:
        current_time = datetime.datetime.now(datetime.timezone.utc)

    high_risk: List[Dict[str, Any]] = []
    for score_rec in plot_scores:
        score = float(score_rec.get("burn_likelihood_score", 0.0))
        end_str = score_rec.get("scoring_window_end")
        if end_str:
            window_end = datetime.datetime.fromisoformat(end_str)
            # Ensure timezone-aware comparison
            if window_end.tzinfo is None:
                window_end = window_end.replace(tzinfo=datetime.timezone.utc)
            if score >= threshold and window_end >= current_time:
                high_risk.append(score_rec)
        elif score >= threshold:
            high_risk.append(score_rec)

    logger.info("Found %d/%d plots above score threshold %0.2f.", len(high_risk), len(plot_scores), threshold)
    return high_risk


def cluster_plots_dbscan(
    plots_with_coords: List[Dict[str, Any]],
    eps_meters: int,
    min_samples: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Execute DBSCAN clustering over plot centroids.

    Returns: (hotspot_clusters, hotspot_cluster_members)
    """
    if not plots_with_coords:
        return [], []

    # Prepare coordinates in radians for haversine metric: [lat_rad, lon_rad]
    coords_rad = np.array([
        [math.radians(p["latitude"]), math.radians(p["longitude"])]
        for p in plots_with_coords
    ])

    eps_rad = eps_meters / EARTH_RADIUS_METERS

    db = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine")
    labels = db.fit_predict(coords_rad)

    cluster_groups: Dict[int, List[Dict[str, Any]]] = {}
    for plot_item, label in zip(plots_with_coords, labels):
        if label >= 0:  # Exclude noise points (-1)
            cluster_groups.setdefault(int(label), []).append(plot_item)

    today_str = datetime.date.today().strftime("%Y%m%d")
    clusters_out: List[Dict[str, Any]] = []
    members_out: List[Dict[str, Any]] = []

    for label_id, members in cluster_groups.items():
        cluster_id = f"CLU-{today_str}-{label_id + 1:03d}"

        # Centroid calculation: arithmetic mean of member coordinates
        mean_lat = float(np.mean([m["latitude"] for m in members]))
        mean_lon = float(np.mean([m["longitude"] for m in members]))
        mean_score = round(float(np.mean([m["burn_likelihood_score"] for m in members])), 4)

        # Earliest effective deadline among members
        deadlines = [
            datetime.datetime.fromisoformat(m["scoring_window_end"])
            for m in members
            if m.get("scoring_window_end")
        ]
        earliest_deadline = min(deadlines).isoformat() if deadlines else (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=72)).isoformat()

        clusters_out.append({
            "cluster_id": cluster_id,
            "centroid": {"latitude": round(mean_lat, 6), "longitude": round(mean_lon, 6)},
            "mean_score": mean_score,
            "effective_deadline": earliest_deadline,
            "member_count": len(members),
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })

        for m in members:
            members_out.append({
                "cluster_id": cluster_id,
                "plot_id": m["plot_id"],
            })

    logger.info("DBSCAN formed %d cluster(s) covering %d plots.", len(clusters_out), len(members_out))
    return clusters_out, members_out


def run_clustering_agent(
    scores: Optional[List[Dict[str, Any]]] = None,
    plot_registry_path: Optional[Path] = None,
    threshold: Optional[float] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Run hotspot clustering agent end-to-end."""
    if threshold is None:
        threshold = config.BURN_SCORE_THRESHOLD

    if plot_registry_path is None:
        plot_registry_path = Path(__file__).resolve().parents[2] / "data" / "registry_seed" / "plot_registry.json"

    with open(plot_registry_path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    plot_meta = {p["plot_id"]: p for p in registry}

    if scores is None:
        from services.scoring_service.main import run_scoring_service
        scores = run_scoring_service()

    # Filter high-risk plots
    high_risk_scores = filter_high_risk_plots(scores, threshold=threshold)

    # Attach coordinates from registry
    plots_with_coords: List[Dict[str, Any]] = []
    for s in high_risk_scores:
        pid = s["plot_id"]
        reg = plot_meta.get(pid)
        if reg and "centroid" in reg:
            plots_with_coords.append({
                **s,
                "latitude": reg["centroid"]["latitude"],
                "longitude": reg["centroid"]["longitude"],
                "block_code": reg.get("block_code"),
            })

    clusters, members = cluster_plots_dbscan(
        plots_with_coords,
        eps_meters=config.CLUSTER_EPS_METERS,
        min_samples=config.CLUSTER_MIN_SAMPLES,
    )
    return clusters, members


if __name__ == "__main__":
    clusters, members = run_clustering_agent()
    print(f"Clusters: {json.dumps(clusters, indent=2)}")
    print(f"Members: {json.dumps(members, indent=2)}")
