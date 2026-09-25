-- ============================================================
-- plot_scores
-- Dataset: burnsignal_scoring
-- Written by: scoring_service (§3.4)
-- One row per plot per run. The primary output consumed by
-- clustering_agent to select plots above BURN_SCORE_THRESHOLD.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_scoring.plot_scores`
(
  plot_id                STRING    NOT NULL,

  -- Vertex AI AutoML regression output (0.0–1.0).
  -- Interpreted as a propensity score; thresholded for clustering.
  burn_likelihood_score  FLOAT64   NOT NULL,

  -- Start of the 72-hour window this score is valid for
  scoring_window_start   TIMESTAMP NOT NULL,

  -- scoring_window_start + 72 hours
  scoring_window_end     TIMESTAMP NOT NULL,

  -- Vertex AI model version string (e.g. 'v1.2-20261001')
  model_version          STRING    NOT NULL,

  -- feature_confidence carried forward from plot_features for
  -- downstream consumers who need to flag low-confidence scores
  feature_confidence     STRING    NOT NULL DEFAULT 'normal',

  -- District code (multi-district partitioning readiness)
  district_code          STRING    NOT NULL,

  -- Pipeline lineage
  pipeline_run_id        STRING,
  scored_at              TIMESTAMP NOT NULL
)
PARTITION BY DATE(scoring_window_start)
CLUSTER BY plot_id, burn_likelihood_score
OPTIONS (
  description = 'Vertex AI AutoML burn-likelihood scores per plot per pipeline run. '
                'scoring_window_end = scoring_window_start + 72h defines the prediction horizon. '
                'clustering_agent reads rows WHERE burn_likelihood_score >= BURN_SCORE_THRESHOLD '
                'AND scoring_window_end >= CURRENT_TIMESTAMP(). '
                'Partitioned by scoring window start date; clustered by plot_id and score '
                'for efficient threshold-filtered reads.'
);
