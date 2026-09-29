"""A2A Coordination Agent (Implementation.md Section 3.6).

Resolves each cluster's member plots to KVK extension worker or district officer fallback,
queries equipment inventory for nearest available machinery slot within 15 km, marks equipment
held, and creates dispatch_task records conforming to schemas/bigquery_ddl/dispatch_task.sql.
"""

from __future__ import annotations

import csv
import datetime
import json
import logging
import math
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Enable direct script execution
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.common.config import config
from services.clustering_agent.main import haversine_distance_meters

logger = logging.getLogger("coordination_agent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def find_assigned_worker(block_code: str, kvk_map: Dict[str, Dict[str, str]]) -> Tuple[str, Optional[str]]:
    """Resolve worker assignment and assignment type.

    Returns: (assignment_type, worker_id)
    """
    if block_code in kvk_map:
        worker_info = kvk_map[block_code]
        return "kvk_worker", worker_info.get("worker_id")
    # Fallback to district officer queue per Architecture Section 11 & Principle 4
    return "district_officer_queue", None


def find_nearest_available_equipment(
    plot_lat: float,
    plot_lon: float,
    equipment_inventory: List[Dict[str, Any]],
    max_distance_km: float,
    deadline_iso: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Find the nearest available machinery slot within distance and deadline."""
    best_slot = None
    min_distance_m = float("inf")
    max_distance_m = max_distance_km * 1000.0

    cluster_deadline = None
    if deadline_iso:
        cluster_deadline = datetime.datetime.fromisoformat(deadline_iso)
        if cluster_deadline.tzinfo is None:
            cluster_deadline = cluster_deadline.replace(tzinfo=datetime.timezone.utc)

    for item in equipment_inventory:
        if item.get("status") != "available":
            continue

        eq_lat = float(item["latitude"])
        eq_lon = float(item["longitude"])
        dist_m = haversine_distance_meters(plot_lat, plot_lon, eq_lat, eq_lon)

        if dist_m <= max_distance_m:
            # Check slot timing against cluster deadline
            slot_start_str = item.get("slot_start")
            if slot_start_str and cluster_deadline:
                # Remove UTC or parse
                clean_str = slot_start_str.replace(" UTC", "+00:00")
                slot_time = datetime.datetime.fromisoformat(clean_str)
                if slot_time.tzinfo is None:
                    slot_time = slot_time.replace(tzinfo=datetime.timezone.utc)
                if slot_time > cluster_deadline:
                    continue  # Slot starts after the deadline window

            if dist_m < min_distance_m:
                min_distance_m = dist_m
                best_slot = item

    return best_slot


def load_kvk_map(csv_path: Path) -> Dict[str, Dict[str, str]]:
    """Load KVK jurisdiction mapping from CSV."""
    kvk_map = {}
    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                kvk_map[row["block_code"]] = row
    return kvk_map


def load_equipment_inventory(csv_path: Path) -> List[Dict[str, Any]]:
    """Load equipment inventory from CSV."""
    inventory = []
    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                inventory.append(dict(row))
    return inventory


def coordinate_cluster_tasks(
    clusters: List[Dict[str, Any]],
    cluster_members: List[Dict[str, Any]],
    plots_registry: Dict[str, Dict[str, Any]],
    kvk_map: Dict[str, Dict[str, str]],
    equipment_inventory: List[Dict[str, Any]],
    max_distance_km: float = 15.0,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Assemble dispatch_task records and update equipment reservation states.

    Returns: (dispatch_tasks, updated_equipment_inventory)
    """
    # Index clusters by cluster_id
    cluster_lookup = {c["cluster_id"]: c for c in clusters}

    # Group members by cluster_id
    tasks: List[Dict[str, Any]] = []

    for member in cluster_members:
        cid = member["cluster_id"]
        pid = member["plot_id"]
        plot = plots_registry.get(pid, {})
        cluster = cluster_lookup.get(cid, {})

        block_code = plot.get("block_code", "")
        centroid = plot.get("centroid", {})
        plot_lat = float(centroid.get("latitude", 0.0))
        plot_lon = float(centroid.get("longitude", 0.0))

        # 1. Resolve Worker
        assignment_type, worker_id = find_assigned_worker(block_code, kvk_map)

        # 2. Resolve Equipment Slot
        effective_deadline = cluster.get("effective_deadline")
        eq_slot = find_nearest_available_equipment(
            plot_lat=plot_lat,
            plot_lon=plot_lon,
            equipment_inventory=equipment_inventory,
            max_distance_km=max_distance_km,
            deadline_iso=effective_deadline,
        )

        task_id = f"TASK-{uuid.uuid4().hex[:8].upper()}"

        if eq_slot is None:
            # Architecture Principle 4: No alert without an action.
            # Mark escalation_required, exclude from worker delivery list.
            task_status = "escalation_required"
            equipment_ref = None
            logger.warning("No equipment available for plot %s in cluster %s; routing to escalation.", pid, cid)
        else:
            # Provisional reservation
            task_status = "pending_script"
            equipment_ref = eq_slot["equipment_id"]
            eq_slot["status"] = "held"  # Hold slot
            logger.info("Matched equipment %s to plot %s (held).", equipment_ref, pid)

        task_row = {
            "task_id": task_id,
            "plot_id": pid,
            "cluster_id": cid,
            "assignment_type": assignment_type,
            "worker_id": worker_id,
            "equipment_ref": equipment_ref,
            "script_ref": None,
            "script_text": None,
            "status": task_status,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        tasks.append(task_row)

    logger.info("Coordinated %d dispatch task(s).", len(tasks))
    return tasks, equipment_inventory


def run_coordination_agent(
    clusters: Optional[List[Dict[str, Any]]] = None,
    members: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Execute coordination agent end-to-end."""
    seed_dir = Path(__file__).resolve().parents[2] / "data" / "registry_seed"

    if clusters is None or members is None:
        from services.clustering_agent.main import run_clustering_agent
        # Run with lowered threshold or synthetic high risk to ensure clusters form for pipeline verification
        clusters, members = run_clustering_agent(threshold=0.15)

    with open(seed_dir / "plot_registry.json", "r", encoding="utf-8") as f:
        plots = json.load(f)
    plot_map = {p["plot_id"]: p for p in plots}

    kvk_map = load_kvk_map(seed_dir / "kvk_jurisdiction_map.csv")
    equipment = load_equipment_inventory(seed_dir / "equipment_inventory.csv")

    tasks, updated_equipment = coordinate_cluster_tasks(
        clusters=clusters,
        cluster_members=members,
        plots_registry=plot_map,
        kvk_map=kvk_map,
        equipment_inventory=equipment,
        max_distance_km=config.EQUIPMENT_MAX_DISTANCE_KM,
    )
    return tasks, updated_equipment


if __name__ == "__main__":
    tasks, _ = run_coordination_agent()
    print(f"Sample coordinated task: {json.dumps(tasks[0] if tasks else {}, indent=2)}")
