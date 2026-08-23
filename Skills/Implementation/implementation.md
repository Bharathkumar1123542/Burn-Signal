# BurnSignal — Implementation Guide

**Document version:** 1.0
**Companion documents:** `project_overview.md` (why/what), `architecture.md` (system design)

---

## 1. Repository Structure

```
burnsignal/
├── services/
│   ├── ingestion_satellite/        # Satellite Ingestion Service
│   ├── loader_socioeconomic/       # Socioeconomic Data Loader
│   ├── feature_pipeline/           # Feature Engineering Pipeline (Dataflow job)
│   ├── scoring_service/            # Vertex AI training + prediction wrapper
│   ├── clustering_agent/           # Hotspot Clustering Agent
│   ├── coordination_agent/         # A2A Coordination Agent
│   └── dispatch_service/           # Voice Script Generation & Dispatch
├── orchestration/
│   └── gemini_cli_pipeline.yaml    # Gemini-CLI pipeline definition (step order, retries)
├── schemas/
│   └── bigquery_ddl/               # One .sql file per table (Section 4)
├── infra/
│   ├── terraform/                  # GCP resource provisioning
│   └── cloud_scheduler/            # Scheduler job definitions
├── data/
│   └── registry_seed/              # Static seed data: plot boundaries, KVK map, equipment inventory
└── tests/
    ├── unit/
    ├── integration/
    └── backtest/                   # Historical burn-event backtesting harness
```

---

## 2. Environment & Configuration

| Variable | Type | Example | Used by |
|---|---|---|---|
| `GCP_PROJECT_ID` | string | `burnsignal-prod` | all services |
| `EE_SERVICE_ACCOUNT_KEY` | secret (JSON) | — | ingestion_satellite |
| `PILOT_DISTRICT_CODE` | string | `PB-SANGRUR` | ingestion_satellite, loader_socioeconomic |
| `BQ_DATASET_RAW` | string | `burnsignal_raw` | ingestion_satellite, loader_socioeconomic |
| `BQ_DATASET_FEATURES` | string | `burnsignal_features` | feature_pipeline |
| `BQ_DATASET_SCORING` | string | `burnsignal_scoring` | scoring_service, clustering_agent, coordination_agent |
| `BQ_DATASET_REGISTRY` | string | `burnsignal_registry` | coordination_agent |
| `VERTEX_ENDPOINT_ID` | string | — | scoring_service |
| `BURN_SCORE_THRESHOLD` | float | `0.6` | clustering_agent |
| `CLUSTER_EPS_METERS` | int | `500` | clustering_agent |
| `CLUSTER_MIN_SAMPLES` | int | `3` | clustering_agent |
| `GEMINI_TTS_API_KEY` | secret | — | dispatch_service |
| `TTS_LANGUAGE_CODE` | string | `pa-IN` (Punjabi) or `hi-IN` (Hindi) | dispatch_service |
| `GCS_AUDIO_BUCKET` | string | `burnsignal-audio` | dispatch_service |
| `GCS_IMAGERY_BUCKET` | string | `burnsignal-imagery` | ingestion_satellite |

All secrets are stored in Google Secret Manager and injected at runtime — never committed to the repository.

---

## 3. Module Specifications

### 3.1 Satellite Ingestion Service

- **Responsibility:** For each active plot in `plot_registry`, fetch the latest available Sentinel-2 (primary) or Landsat-8 (fallback/calibration) surface-reflectance image covering that plot's geometry; compute NDVI; difference against the plot's stored pre-harvest baseline NDVI; write the result.
- **Inputs:** `plot_registry` (BigQuery, dataset `burnsignal_registry`) — plot ID, geometry (GeoJSON), baseline NDVI, baseline date.
- **Core logic:**
  1. Query Earth Engine `ImageCollection` for the plot's bounding geometry, filtered to images captured in the last 5 days (Sentinel-2 revisit) with cloud cover < 20%.
  2. If no Sentinel-2 image passes the cloud filter, widen to the last 16 days and include Landsat-8.
  3. Compute NDVI = (NIR − Red) / (NIR + Red) using the relevant band indices for the source satellite.
  4. `residue_index = baseline_ndvi − current_ndvi` (a larger positive value indicates more residue/less green cover than baseline, consistent with post-harvest stubble).
  5. Write one row per plot per run to `plot_residue_readings`.
- **Output schema:** see Section 4, `plot_residue_readings`.
- **Error handling:** if no usable image exists within the widened window, write a row with `residue_index = null`, `stale_imagery = true`, and the last known value carried forward is handled downstream by the Feature Engineering Pipeline (Section 3.3), not by this service.

### 3.2 Socioeconomic Data Loader

- **Responsibility:** Load/refresh block-level MSP realization rate and subsidy/equipment-scheme uptake rate from the source dataset (Assumption A3, `project_overview.md`).
- **Inputs:** Government open-data CSV export (schema fixed at ingestion time; see `data/registry_seed/msp_subsidy_schema.md` for the exact source column mapping used at build time).
- **Core logic:** Standard extract-transform-load — parse CSV, map source columns to `block_code`, `msp_realization_rate`, `subsidy_uptake_rate`, `as_of_date`; upsert into `block_socioeconomic` keyed on `block_code, as_of_date`.
- **Output schema:** see Section 4, `block_socioeconomic`.
- **Cadence:** weekly (`architecture.md` Section 3).

### 3.3 Feature Engineering Pipeline

- **Responsibility:** Join `plot_residue_readings` (plot-level, daily) with `block_socioeconomic` (block-level, weekly) via the plot's `block_code`, and compute derived features.
- **Core logic:**
  1. For each plot, take the most recent `plot_residue_readings` row.
  2. If `stale_imagery = true`, carry forward the last non-stale `residue_index` value and set `feature_confidence = "degraded"`; if no non-stale value exists within 14 days, exclude the plot from this run (do not score with a null residue signal).
  3. Join to `block_socioeconomic` on `block_code`, taking the most recent `as_of_date` at or before the current run date.
  4. Compute `residue_index_trend_7d` as the linear slope of `residue_index` over the last 7 available readings for that plot.
  5. Compute `days_since_harvest_estimate` and `sowing_deadline_pressure_days` from the plot's registered crop calendar (`plot_registry.crop_calendar`).
  6. Write one row per plot per run to `plot_features`.
- **Output schema:** see Section 4, `plot_features`.
- **Implementation note:** implemented as a scheduled BigQuery SQL job (not a full Dataflow pipeline) for MVP, given the data volumes described in `architecture.md` Section 9.1; Dataflow is the documented upgrade path if per-plot custom logic (e.g. more complex trend models) is needed later.

### 3.4 Burn-Likelihood Scoring Service

- **Responsibility:** Wrap the Vertex AI AutoML Prediction endpoint; call it for every row in the latest `plot_features` run; write results.
- **Training (offline, not part of the runtime pipeline):**
  1. Build training set: historical `plot_features` snapshots joined to a `burned_within_72h` label derived from VIIRS/MODIS active-fire detections falling within each plot's geometry within 72 hours of the feature snapshot timestamp.
  2. Train via Vertex AI AutoML Tables (regression), target `burned_within_72h`, features as listed in `architecture.md` Section 6.
  3. Deploy the resulting model to a Vertex AI Prediction endpoint; record `VERTEX_ENDPOINT_ID`.
- **Runtime logic:**
  1. Read latest `plot_features` rows for the current run.
  2. Batch-call the Vertex AI Prediction endpoint (batch size configurable, default 500 rows/call, per `architecture.md` Section 11 mitigation for quota/latency).
  3. Write `plot_id, burn_likelihood_score, scoring_window_start, scoring_window_end, model_version` to `plot_scores`.
- **Output schema:** see Section 4, `plot_scores`.

### 3.5 Hotspot Clustering Agent

- **Responsibility:** Identify geographically and temporally coherent clusters of high-risk plots.
- **Core logic:**
  1. Select all `plot_scores` rows where `burn_likelihood_score >= BURN_SCORE_THRESHOLD` and `scoring_window_end >= now()`.
  2. Run DBSCAN over plot centroid coordinates with `eps = CLUSTER_EPS_METERS`, `min_samples = CLUSTER_MIN_SAMPLES`.
  3. For each resulting cluster, compute centroid, member plot list, mean score, and the earliest `scoring_window_end` among members (the cluster's effective deadline).
  4. Write one row per cluster to `hotspot_clusters`, and one row per member plot to `hotspot_cluster_members`.
- **Output schema:** see Section 4, `hotspot_clusters` / `hotspot_cluster_members`.

### 3.6 A2A Coordination Agent

- **Responsibility:** Resolve each cluster's member plots to a delivery path (KVK worker or fallback queue) and attach an available equipment reference; assemble `dispatch_task` rows.
- **Core logic:**
  1. For each plot in `hotspot_cluster_members`, look up `kvk_jurisdiction_map` by the plot's `block_code` to find the assigned `worker_id`.
  2. If no `worker_id` is found, set `assignment_type = "district_officer_queue"` instead (per `architecture.md` Section 11).
  3. Query `equipment_inventory` for the nearest available slot to the plot centroid, within a configurable max distance (`EQUIPMENT_MAX_DISTANCE_KM`, default 15 km) and within the cluster's effective deadline.
  4. If no equipment slot is found, set `equipment_ref = null` and `status = "escalation_required"` — per Architecture Principle 4, this task is excluded from the worker's call list until resolved, but is visible on the officer's escalation view.
  5. If a slot is found, mark it provisionally reserved (`equipment_inventory.status = "held"`) and write the `dispatch_task` row with `status = "pending_script"`.
- **Output schema:** see Section 4, `dispatch_task`.

### 3.7 Voice Script Generation & Dispatch Service

- **Responsibility:** For each `dispatch_task` with `status = "pending_script"`, generate a personalized vernacular script via Gemini TTS and finalize the task for worker delivery.
- **Core logic:**
  1. Build the prompt from a fixed template (Section 5.2) populated with: farmer name, plot ID/local field name, estimated residue load in plain language (e.g. "high" / "moderate"), nearest equipment type and slot time, and the assigned worker's callback number.
  2. Call the Gemini TTS API with `TTS_LANGUAGE_CODE`.
  3. Store the returned audio file in `GCS_AUDIO_BUCKET` under `{task_id}.mp3`; store the generated script text inline.
  4. Update `dispatch_task`: `script_ref`, `script_text`, `status = "ready_for_delivery"`.
- **Output:** updated `dispatch_task` rows, audio files in Cloud Storage.

### 3.8 Orchestrator (Gemini-CLI)

- **Responsibility:** Run the full pipeline (Sections 3.1–3.7) in order on the schedule defined in `architecture.md` Section 4, handling per-stage retry and writing to `pipeline_run_log`.
- **Definition location:** `orchestration/gemini_cli_pipeline.yaml` — declares stage order, per-stage timeout, and retry count; each stage is invoked as an independent Cloud Run job (not an in-process call), consistent with Architecture Principle 3.

---

## 4. Data Schemas

### `plot_registry` (dataset: `burnsignal_registry`)
| Field | Type | Notes |
|---|---|---|
| `plot_id` | STRING | Primary key |
| `block_code` | STRING | Foreign key to `block_socioeconomic` |
| `geometry` | GEOGRAPHY | Plot boundary |
| `baseline_ndvi` | FLOAT | Pre-harvest reference NDVI |
| `baseline_date` | DATE | |
| `crop_calendar` | JSON | Sowing/harvest deadline dates used for pressure features |

### `plot_residue_readings` (dataset: `burnsignal_raw`)
| Field | Type | Notes |
|---|---|---|
| `plot_id` | STRING | |
| `reading_date` | DATE | |
| `residue_index` | FLOAT, nullable | Null if `stale_imagery = true` |
| `stale_imagery` | BOOL | |
| `source_satellite` | STRING | `sentinel-2` or `landsat-8` |

### `block_socioeconomic` (dataset: `burnsignal_raw`)
| Field | Type | Notes |
|---|---|---|
| `block_code` | STRING | |
| `as_of_date` | DATE | |
| `msp_realization_rate` | FLOAT | 0–1 |
| `subsidy_uptake_rate` | FLOAT | 0–1 |

### `plot_features` (dataset: `burnsignal_features`)
| Field | Type | Notes |
|---|---|---|
| `plot_id` | STRING | |
| `run_timestamp` | TIMESTAMP | |
| `residue_index` | FLOAT | |
| `residue_index_trend_7d` | FLOAT | |
| `msp_realization_rate` | FLOAT | |
| `subsidy_uptake_rate` | FLOAT | |
| `days_since_harvest_estimate` | INT | |
| `plot_area_hectares` | FLOAT | |
| `sowing_deadline_pressure_days` | INT | |
| `feature_confidence` | STRING | `"normal"` or `"degraded"` |

### `plot_scores` (dataset: `burnsignal_scoring`)
| Field | Type | Notes |
|---|---|---|
| `plot_id` | STRING | |
| `burn_likelihood_score` | FLOAT | 0–1 |
| `scoring_window_start` | TIMESTAMP | |
| `scoring_window_end` | TIMESTAMP | `scoring_window_start` + 72h |
| `model_version` | STRING | |

### `hotspot_clusters` (dataset: `burnsignal_scoring`)
| Field | Type | Notes |
|---|---|---|
| `cluster_id` | STRING | Primary key |
| `centroid` | GEOGRAPHY | |
| `mean_score` | FLOAT | |
| `effective_deadline` | TIMESTAMP | Earliest `scoring_window_end` among members |

### `hotspot_cluster_members` (dataset: `burnsignal_scoring`)
| Field | Type | Notes |
|---|---|---|
| `cluster_id` | STRING | Foreign key |
| `plot_id` | STRING | Foreign key |

### `kvk_jurisdiction_map` (dataset: `burnsignal_registry`)
| Field | Type | Notes |
|---|---|---|
| `block_code` | STRING | |
| `worker_id` | STRING | |
| `worker_name` | STRING | |
| `worker_phone` | STRING | PII — access-restricted per `architecture.md` Section 9.4 |

### `equipment_inventory` (dataset: `burnsignal_registry`)
| Field | Type | Notes |
|---|---|---|
| `equipment_id` | STRING | |
| `equipment_type` | STRING | e.g. `"happy_seeder"`, `"baler"` |
| `location` | GEOGRAPHY | |
| `slot_start` | TIMESTAMP | |
| `slot_end` | TIMESTAMP | |
| `status` | STRING | `"available"`, `"held"`, `"booked"` |

### `dispatch_task` (dataset: `burnsignal_scoring`)
| Field | Type | Notes |
|---|---|---|
| `task_id` | STRING | Primary key |
| `plot_id` | STRING | |
| `cluster_id` | STRING | |
| `assignment_type` | STRING | `"kvk_worker"` or `"district_officer_queue"` |
| `worker_id` | STRING, nullable | |
| `equipment_ref` | STRING, nullable | Foreign key to `equipment_inventory.equipment_id` |
| `script_ref` | STRING, nullable | Path in `GCS_AUDIO_BUCKET` |
| `script_text` | STRING, nullable | |
| `status` | STRING | `"pending_script"`, `"ready_for_delivery"`, `"escalation_required"`, `"delivered"` |
| `created_at` | TIMESTAMP | |

### `pipeline_run_log` (dataset: `burnsignal_scoring`)
| Field | Type | Notes |
|---|---|---|
| `run_id` | STRING | |
| `stage` | STRING | One of the Section 3 module names |
| `start_time` | TIMESTAMP | |
| `end_time` | TIMESTAMP, nullable | |
| `rows_in` | INT | |
| `rows_out` | INT | |
| `status` | STRING | `"success"`, `"failed"`, `"degraded"` |

---

## 5. API / Interface Contracts

### 5.1 Internal service contracts (all via BigQuery tables, per `architecture.md` Section 10)
No direct service-to-service RPCs are used in MVP; each service reads its input table(s) and writes its output table(s) as defined in Section 4. This is a deliberate simplicity choice for the hackathon build — see `architecture.md` Principle 3.

### 5.2 Gemini TTS prompt template (used by `dispatch_service`, Section 3.7)

```
Language: {TTS_LANGUAGE_CODE}
Tone: respectful, calm, non-alarming, addressed to a farmer by name.
Content requirements:
  - Greet the farmer by {farmer_name}.
  - Reference their field ({plot_local_name}) and the observed residue level ({residue_level_plain_language}) without technical jargon.
  - Offer the specific alternative: {equipment_type} available at {slot_start_time_local} near {slot_location_description}.
  - Provide the callback number for {worker_name} ({worker_phone}) for confirmation.
  - Close with a clear, single call to action (confirm the slot).
  - Maximum length: 45 seconds spoken.
```

### 5.3 Ops Dashboard queries (read-only, Looker Studio or lightweight app)
- Worker view: `SELECT * FROM dispatch_task WHERE worker_id = :current_worker_id AND status = 'ready_for_delivery'`
- District officer view: `SELECT * FROM hotspot_clusters` joined to `dispatch_task` where `status = 'escalation_required'`
- Aggregate/anonymized view (Pollution Control Board): `SELECT cluster_id, centroid, mean_score, effective_deadline FROM hotspot_clusters` — no join to `dispatch_task` or any PII table, per `architecture.md` Section 9.4.

---

## 6. Deployment Steps

1. **Provision GCP resources** (Terraform, `infra/terraform/`): BigQuery datasets (Section 4), Cloud Storage buckets, Vertex AI Prediction endpoint placeholder, Cloud Run services (one per Section 3 module), Cloud Scheduler jobs, Secret Manager entries for `EE_SERVICE_ACCOUNT_KEY` and `GEMINI_TTS_API_KEY`.
2. **Load registry/seed data** (`data/registry_seed/`): `plot_registry`, `kvk_jurisdiction_map`, `equipment_inventory` — one-time load for the pilot district.
3. **Run historical backfill:** execute `services/ingestion_satellite` and `services/loader_socioeconomic` against historical date ranges to populate training data for Section 3.4's offline training step.
4. **Train and deploy the AutoML model:** run the Vertex AI AutoML training job against the backfilled `plot_features` + VIIRS/MODIS-derived labels; deploy to a Prediction endpoint; set `VERTEX_ENDPOINT_ID`.
5. **Deploy runtime services:** build and deploy each `services/*` directory as a Cloud Run service; deploy `orchestration/gemini_cli_pipeline.yaml` as the scheduled orchestration job.
6. **Enable Cloud Scheduler jobs** per the cadence in `architecture.md` Section 4 (daily for ingestion/scoring/clustering/coordination/dispatch, weekly for the socioeconomic loader).
7. **Smoke test:** trigger one manual pipeline run end-to-end; verify a `dispatch_task` row reaches `status = "ready_for_delivery"` with a non-null `script_ref`.
8. **Backtest validation:** run `tests/backtest/` against held-out historical burn events; confirm precision@top-decile and median lead-time metrics meet the targets in `project_overview.md` Section 5 before demo.

---

## 7. Testing Strategy

| Layer | What is tested | Example cases |
|---|---|---|
| Unit | Each module's core logic function in isolation | NDVI differencing math; DBSCAN clustering with a synthetic point set; prompt template population with edge-case null fields |
| Integration | Adjacent pipeline stages via their shared BigQuery contract | `plot_residue_readings` → `plot_features` join produces expected `feature_confidence` flagging when imagery is stale |
| End-to-end | Full pipeline run on a small synthetic district | One manual trigger produces at least one `dispatch_task` reaching `ready_for_delivery` |
| Backtest | Model + pipeline performance against historical ground truth | Precision@top-decile ≥ 0.65; median lead time ≥ 48h (targets from `project_overview.md` Section 5) |
| Fallback-path | Failure-mode handling per `architecture.md` Section 11 | Cluster with no KVK mapping routes to `district_officer_queue`; cluster with no equipment slot sets `status = "escalation_required"` and is excluded from worker delivery |

---

## 8. Build Order (maps to `project_overview.md` Section 9 milestones)

| Phase | Concrete tasks |
|---|---|
| Phase 0 | Provision GCP project and Terraform-managed resources; load `plot_registry`, `kvk_jurisdiction_map`, `equipment_inventory` seed data; confirm Earth Engine service account access |
| Phase 1 | Implement and test `ingestion_satellite`, `loader_socioeconomic`, `feature_pipeline`; backfill historical data; train and deploy the Vertex AI AutoML model; implement `scoring_service` |
| Phase 2 | Implement and test `clustering_agent`; implement `coordination_agent` including both fallback paths (Section 11 of `architecture.md`) |
| Phase 3 | Implement `dispatch_service` including Gemini TTS integration; build the read-only Ops Dashboard views (Section 5.3) |
| Phase 4 | Run backtest suite; tune `BURN_SCORE_THRESHOLD`, `CLUSTER_EPS_METERS` against backtest precision; prepare demo narrative using backtest metrics as evidence |

---

## 9. Open Decisions Requiring Explicit Sign-off

These are not ambiguous by omission — each has a concrete decision to make before the corresponding phase starts:

| Decision | Options | Must be resolved before |
|---|---|---|
| Pilot district selection | Any district with (a) available plot boundary GIS data and (b) a usable KVK registry | Phase 0 |
| Vernacular language(s) for TTS | Hindi (`hi-IN`), Punjabi (`pa-IN`), or both depending on pilot district | Phase 3 |
| `BURN_SCORE_THRESHOLD` default | Start at 0.6; adjust based on Phase 4 backtest precision/recall trade-off | Phase 4, before demo |
| Equipment inventory data source for MVP | Static CSV snapshot (fastest) vs. a mocked API mimicking a future live booking system (more representative of production) | Phase 0, before `coordination_agent` implementation begins |
