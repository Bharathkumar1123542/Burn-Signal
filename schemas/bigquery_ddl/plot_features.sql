-- ============================================================
-- plot_features
-- Dataset: burnsignal_features
-- Written by: feature_pipeline service (§3.3)
-- Model-ready joined feature table. One row per plot per run.
-- Partitioned by run day for efficient scoring-service reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_features.plot_features`
(
  plot_id                       STRING    NOT NULL,

  -- Timestamp of the pipeline run that produced this row
  run_timestamp                 TIMESTAMP NOT NULL,

  -- ── Biophysical features (from plot_residue_readings) ──────────
  -- NDVI differencing result (baseline − current). Null-handled
  -- upstream per §3.3 stale-imagery carry-forward logic.
  residue_index                 FLOAT64,

  -- Linear slope of residue_index over the last 7 available readings.
  -- Positive trend → residue accumulating (increasing burn pressure).
  residue_index_trend_7d        FLOAT64,

  -- ── Socioeconomic features (from block_socioeconomic) ──────────
  msp_realization_rate          FLOAT64,
  subsidy_uptake_rate           FLOAT64,

  -- ── Derived time-pressure features (from plot_registry) ────────
  -- Number of days since estimated harvest (from crop_calendar).
  days_since_harvest_estimate   INT64,

  -- Days until next-crop sowing deadline (proxy for field-clearance urgency).
  sowing_deadline_pressure_days INT64,

  -- ── Plot metadata (denormalized from registry for model input) ──
  plot_area_hectares            FLOAT64,

  -- District code for multi-district partitioning readiness (§9.1)
  district_code                 STRING    NOT NULL,

  -- Block code (used for downstream joins)
  block_code                    STRING    NOT NULL,

  -- ── Data quality flag ──────────────────────────────────────────
  -- 'normal'   → all source signals current and within expected range.
  -- 'degraded' → stale imagery carry-forward was applied (§3.3).
  feature_confidence            STRING    NOT NULL DEFAULT 'normal',

  -- Source readings that contributed to this row
  source_reading_date           DATE,
  source_socioeconomic_date     DATE,

  -- Pipeline lineage
  pipeline_run_id               STRING
)
PARTITION BY DATE(run_timestamp)
CLUSTER BY plot_id, district_code
OPTIONS (
  description = 'Model-ready feature table produced by the feature engineering pipeline. '
                'Joins biophysical (satellite NDVI) and socioeconomic (MSP/subsidy) signals '
                'at plot level. One row per plot per daily pipeline run. '
                'feature_confidence = ''degraded'' signals stale satellite data to downstream consumers. '
                'Partitioned by run day; clustered by plot_id and district_code.'
);
