-- ============================================================
-- pipeline_run_log
-- Dataset: burnsignal_scoring
-- Written by every pipeline stage (§3.1–§3.7).
-- Per architecture.md §9.5: each stage writes a row so any
-- failed or delayed run is diagnosable from BigQuery directly
-- without log-diving (no Cloud Logging required for triage).
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_scoring.pipeline_run_log`
(
  -- Shared UUID across all stages of a single pipeline execution.
  -- Set by the Gemini-CLI orchestrator at run start (§3.8).
  run_id      STRING    NOT NULL,

  -- One of the §3.x module names:
  -- 'ingestion_satellite' | 'loader_socioeconomic' | 'feature_pipeline'
  -- 'scoring_service'     | 'clustering_agent'     | 'coordination_agent'
  -- 'dispatch_service'
  stage       STRING    NOT NULL,

  -- Stage execution window
  start_time  TIMESTAMP NOT NULL,
  end_time    TIMESTAMP,   -- NULL while stage is running

  -- Input and output row counts (for data-volume monitoring)
  rows_in     INT64     NOT NULL DEFAULT 0,
  rows_out    INT64     NOT NULL DEFAULT 0,

  -- 'success'  → stage completed and wrote expected output
  -- 'failed'   → stage terminated with an error
  -- 'degraded' → stage completed but with data quality warnings
  --              (e.g. stale_imagery fraction above warning threshold)
  -- 'running'  → stage currently in progress (end_time IS NULL)
  -- 'pending'  → stage not yet triggered
  status      STRING    NOT NULL DEFAULT 'pending',

  -- Error detail when status = 'failed'
  error_message STRING,

  -- Additional structured metadata (retry count, batch sizes, etc.)
  metadata    JSON,

  -- District this run covers
  district_code STRING NOT NULL
)
PARTITION BY DATE(start_time)
CLUSTER BY run_id, stage
OPTIONS (
  description = 'Pipeline execution log. One row per stage per run. '
                'Every service writes its own row at stage start and updates '
                'end_time + status + rows_in/out on completion. '
                'Enables full run diagnosis from BigQuery without log-diving '
                '(architecture.md §9.5). '
                'Orchestrator (§3.8) reads this table to determine retry eligibility: '
                'a failed stage can be retried against the last successful upstream output '
                'without re-running the whole pipeline (architecture.md §9.2). '
                'Partitioned by run date; clustered by run_id and stage '
                'for per-run cross-stage queries.'
);
