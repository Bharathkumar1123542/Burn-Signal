-- ============================================================
-- plot_residue_readings
-- Dataset: burnsignal_raw
-- Written by: ingestion_satellite service (§3.1)
-- Partitioned by reading_date for efficient daily query scans.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_raw.plot_residue_readings`
(
  plot_id          STRING    NOT NULL,

  -- Date of satellite pass used for this reading
  reading_date     DATE      NOT NULL,

  -- NDVI differencing result: baseline_ndvi − current_ndvi
  -- Positive → more residue / less green cover than baseline.
  -- NULL when stale_imagery = TRUE (no usable pass in window).
  residue_index    FLOAT64,

  -- TRUE when no image passed cloud filter within the look-back window.
  -- Downstream feature pipeline carries forward last non-stale value
  -- and flags feature_confidence = 'degraded'.
  stale_imagery    BOOL      NOT NULL DEFAULT FALSE,

  -- 'sentinel-2' | 'landsat-8'
  source_satellite STRING,

  -- Cloud cover percentage of the selected image (0–100)
  cloud_cover_pct  FLOAT64,

  -- Current NDVI captured in this pass (before differencing)
  current_ndvi     FLOAT64,

  -- Ingestion pipeline run that produced this row
  pipeline_run_id  STRING,

  -- Row insert timestamp
  ingested_at      TIMESTAMP NOT NULL
)
PARTITION BY reading_date
CLUSTER BY plot_id
OPTIONS (
  description = 'Per-plot NDVI residue index readings from the satellite '
                'ingestion service. One row per plot per daily pipeline run. '
                'Partitioned by reading_date for efficient date-range scans. '
                'Clustered by plot_id for fast single-plot lookups.'
);
