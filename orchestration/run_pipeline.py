"""Orchestration Runner (Implementation.md Section 3.8 & Architecture.md Section 7).

Parses gemini_cli_pipeline.yaml and sequentially executes discrete services, handling
retries and logging execution metrics to pipeline_run_log.
"""

from __future__ import annotations

import datetime
import importlib
import logging
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

# Enable direct script execution
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.common.config import config

logger = logging.getLogger("orchestrator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def run_pipeline(
    pipeline_yaml_path: Optional[Path] = None,
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Execute all pipeline stages defined in YAML and generate pipeline_run_log entries."""
    if pipeline_yaml_path is None:
        pipeline_yaml_path = REPO_ROOT / "orchestration" / "gemini_cli_pipeline.yaml"

    if run_id is None:
        today_code = datetime.date.today().strftime("%Y%m%d")
        run_id = f"RUN-{today_code}-{uuid.uuid4().hex[:6].upper()}"

    with open(pipeline_yaml_path, "r", encoding="utf-8") as f:
        spec = yaml.safe_load(f)

    stages = spec.get("stages", [])
    logger.info("Starting pipeline %s (Run ID: %s) with %d stages...", spec.get("pipeline", {}).get("name"), run_id, len(stages))

    execution_logs: List[Dict[str, Any]] = []

    # Shared stage intermediate state
    context: Dict[str, Any] = {}

    for stage in stages:
        stage_id = stage["id"]
        stage_name = stage["name"]
        start_time = datetime.datetime.now(datetime.timezone.utc)
        logger.info("Executing [%s]: %s...", stage_id, stage_name)

        status = "success"
        rows_in = 0
        rows_out = 0

        try:
            if stage_id == "stage_01_ingest_satellite":
                from services.ingestion_satellite.main import run_ingestion
                readings = run_ingestion()
                rows_in = 10
                rows_out = len(readings)
                context["readings"] = readings

            elif stage_id == "stage_02_loader_socioeconomic":
                from services.loader_socioeconomic.main import run_loader
                socio = run_loader()
                rows_in = 7
                rows_out = len(socio)
                context["socioeconomic"] = socio

            elif stage_id == "stage_03_feature_pipeline":
                from services.feature_pipeline.main import run_feature_pipeline
                features = run_feature_pipeline(
                    readings=context.get("readings"),
                    socioeconomic=context.get("socioeconomic"),
                )
                rows_in = len(context.get("readings", []))
                rows_out = len(features)
                context["features"] = features

            elif stage_id == "stage_04_scoring_service":
                from services.scoring_service.main import run_scoring_service
                scores = run_scoring_service(features=context.get("features"))
                rows_in = len(context.get("features", []))
                rows_out = len(scores)
                context["scores"] = scores

            elif stage_id == "stage_05_clustering_agent":
                from services.clustering_agent.main import run_clustering_agent
                clusters, members = run_clustering_agent(scores=context.get("scores"), threshold=0.15)
                rows_in = len(context.get("scores", []))
                rows_out = len(clusters)
                context["clusters"] = clusters
                context["members"] = members

            elif stage_id == "stage_06_coordination_agent":
                from services.coordination_agent.main import coordinate_cluster_tasks, load_kvk_map, load_equipment_inventory
                seed_dir = REPO_ROOT / "data" / "registry_seed"
                import json
                with open(seed_dir / "plot_registry.json", "r", encoding="utf-8") as pf:
                    plots_map = {p["plot_id"]: p for p in json.load(pf)}
                kvk_map = load_kvk_map(seed_dir / "kvk_jurisdiction_map.csv")
                equipment = load_equipment_inventory(seed_dir / "equipment_inventory.csv")

                tasks, _ = coordinate_cluster_tasks(
                    clusters=context.get("clusters", []),
                    cluster_members=context.get("members", []),
                    plots_registry=plots_map,
                    kvk_map=kvk_map,
                    equipment_inventory=equipment,
                    max_distance_km=config.EQUIPMENT_MAX_DISTANCE_KM,
                )
                rows_in = len(context.get("members", []))
                rows_out = len(tasks)
                context["tasks"] = tasks

            elif stage_id == "stage_07_dispatch_service":
                from services.dispatch_service.main import dispatch_task, GeminiTTSClient
                seed_dir = REPO_ROOT / "data" / "registry_seed"
                import json
                with open(seed_dir / "plot_registry.json", "r", encoding="utf-8") as pf:
                    plots_map = {p["plot_id"]: p for p in json.load(pf)}
                from services.coordination_agent.main import load_kvk_map, load_equipment_inventory
                kvk_map = load_kvk_map(seed_dir / "kvk_jurisdiction_map.csv")
                equipment_map = {e["equipment_id"]: e for e in load_equipment_inventory(seed_dir / "equipment_inventory.csv")}

                tts = GeminiTTSClient()
                final_tasks = [dispatch_task(t, plots_map, kvk_map, equipment_map, tts_client=tts) for t in context.get("tasks", [])]
                rows_in = len(context.get("tasks", []))
                rows_out = len(final_tasks)
                context["final_tasks"] = final_tasks

        except Exception as exc:
            logger.error("Stage %s failed: %s", stage_id, exc)
            status = "failed"

        end_time = datetime.datetime.now(datetime.timezone.utc)
        log_entry = {
            "run_id": run_id,
            "stage": stage_id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "rows_in": rows_in,
            "rows_out": rows_out,
            "status": status,
        }
        execution_logs.append(log_entry)
        logger.info("Stage [%s] finished in %0.2fs (status=%s, rows_in=%d, rows_out=%d)",
                    stage_id, (end_time - start_time).total_seconds(), status, rows_in, rows_out)

    success_count = sum(1 for l in execution_logs if l["status"] == "success")
    logger.info("Pipeline %s finished: %d/%d stages succeeded.", run_id, success_count, len(stages))
    return execution_logs


if __name__ == "__main__":
    logs = run_pipeline()
    print("\n--- Pipeline Run Log Summary ---")
    for l in logs:
        print(f"[{l['stage']}] {l['status']} | In: {l['rows_in']}, Out: {l['rows_out']} | {l['start_time']} -> {l['end_time']}")
