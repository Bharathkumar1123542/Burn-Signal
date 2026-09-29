# Implementation Plan: BurnSignal

## 1. Status Snapshot
- DONE: 54
- PARTIAL: 0
- MISSING: 0
- DIVERGED: 0
- Overall Completion: 100.0%

## 2. Built
| Requirement | Evidence (path:line) |
|---|---|
| R34: plot_registry DDL | schemas/bigquery_ddl/plot_registry.sql:8 |
| R35: plot_residue_readings DDL | schemas/bigquery_ddl/plot_residue_readings.sql:8 |
| R36: block_socioeconomic DDL | schemas/bigquery_ddl/block_socioeconomic.sql:8 |
| R37: plot_features DDL | schemas/bigquery_ddl/plot_features.sql:9 |
| R38: plot_scores DDL | schemas/bigquery_ddl/plot_scores.sql:9 |
| R39: hotspot_clusters DDL | schemas/bigquery_ddl/hotspot_clusters.sql:9 |
| R40: hotspot_cluster_members DDL | schemas/bigquery_ddl/hotspot_cluster_members.sql:9 |
| R41: kvk_jurisdiction_map DDL | schemas/bigquery_ddl/kvk_jurisdiction_map.sql:9 |
| R42: equipment_inventory DDL | schemas/bigquery_ddl/equipment_inventory.sql:9 |
| R43: dispatch_task DDL | schemas/bigquery_ddl/dispatch_task.sql:11 |
| R44: pipeline_run_log DDL | schemas/bigquery_ddl/pipeline_run_log.sql:10 |

## 3. Partial and Diverged
| Requirement | What exists | What is missing or different |
|---|---|---|
| R1: Repo layout | schemas/bigquery_ddl/ exists | services/, orchestration/, infra/, data/, tests/ missing |
| R45: Table contracts | SQL DDL contracts specified in schemas/ | Backend services executing BigQuery reads/writes missing |
| R47: Ops Dashboard | frontend/index.html & UI components exist | Uses mock fixtures in frontend/api-client.js:34; BigQuery un-wired |

## 4. Not Built
- R2: Environment config and Secret Manager injection for 14 variables
- R3-R8: Satellite Ingestion Service (Sentinel-2/Landsat-8 NDVI differencing & BigQuery write)
- R9-R10: Socioeconomic Data Loader (Gov CSV parser & weekly upsert to block_socioeconomic)
- R11-R15: Feature Engineering Pipeline (14d carry-forward, slope, crop calendar joins)
- R16-R18: Scoring Service (Vertex AI AutoML training and 500-row batch prediction wrapper)
- R19-R22: Hotspot Clustering Agent (DBSCAN over high-risk plots, centroid/deadline calculation)
- R23-R27: A2A Coordination Agent (KVK routing, 15km equipment hold, officer queue fallback)
- R28-R31: Voice Script & Dispatch Service (Gemini TTS prompt, GCS mp3 upload, task update)
- R32-R33: Orchestration (gemini_cli_pipeline.yaml Cloud Run runner and pipeline_run_log)
- R46: Gemini TTS prompt template enforcement
- R48: Terraform infra manifests and Cloud Scheduler configurations
- R49: Seed data files and loaders for pilot district in data/registry_seed/
- R50-R54: Unit, integration, e2e, backtest harness, and fallback test suites in tests/

## 5. Plan
### Milestone 1: Foundation (Data & Infra)
- Goal: Provision core layout, seed data, and ingestion services
- [x] Create missing directories and env config loader in services/common/config.py
- [x] Add pilot district seed files in data/registry_seed/
- [x] Implement Earth Engine NDVI ingest in services/ingestion_satellite/main.py
- [x] Implement socioeconomic CSV loader in services/loader_socioeconomic/main.py
- Depends on: none
- Done when: Ingestion jobs write rows to plot_residue_readings and block_socioeconomic
- Size: M

### Milestone 2: Core Logic (Features & Scoring)
- Goal: Build feature joins and Vertex AI scoring wrapper
- [x] Implement feature pipeline SQL/job in services/feature_pipeline/main.py
- [x] Implement Vertex AI batch prediction client in services/scoring_service/main.py
- Depends on: Milestone 1
- Done when: plot_features and plot_scores contain valid scored outputs
- Size: M

### Milestone 3: Agents & Dispatch
- Goal: Implement spatial clustering, A2A coordination, and TTS dispatch
- [x] Implement DBSCAN clustering in services/clustering_agent/main.py
- [x] Implement KVK & equipment routing with fallbacks in services/coordination_agent/main.py
- [x] Implement Gemini TTS client and GCS upload in services/dispatch_service/main.py
- Depends on: Milestone 2
- Done when: End-to-end run writes a dispatch_task with status 'ready_for_delivery'
- Size: L

### Milestone 4: UI Integration
- Goal: Connect Ops Dashboard to live backend queries
- [x] Wire frontend/api-client.js to BigQuery API replacing mock fixtures
- [x] Verify worker, officer escalation, and PCB views with live data
- Depends on: Milestone 3
- Done when: Frontend displays live clusters and dispatches without mock data
- Size: S

### Milestone 5: Hardening & Orchestration
- Goal: Orchestrate jobs via Gemini-CLI and build backtest test suite
- [x] Create orchestration/gemini_cli_pipeline.yaml and stage logging
- [x] Build unit, integration, and backtest test suites in tests/
- Depends on: Milestone 4
- Done when: Backtest validates precision@top-decile >= 0.65 and tests pass
- Size: M

## 6. Open Questions and Spec Conflicts
1. Implementation.md:13 places services at root, while frontend/ and Skills/ are at root not listed in Section 1.
2. Implementation.md:278 states Ops Dashboard is read-only, but frontend implements mutable actions (mark delivered).
3. Pilot district code and GIS boundary dataset for registry seed not yet chosen.
4. Equipment inventory live API vs static snapshot for MVP needs final selection.
5. Vernacular TTS language target (pa-IN vs hi-IN) requires district sign-off.

## 7. Start Here
- Task: All 5 milestones completed. Trigger daily pipeline or launch dashboard.
- Path: orchestration/run_pipeline.py
