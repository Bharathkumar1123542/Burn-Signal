-- ============================================================
-- block_socioeconomic
-- Dataset: burnsignal_raw
-- Written by: loader_socioeconomic service (§3.2)
-- Refreshed weekly. Block is the administrative unit below district.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_raw.block_socioeconomic`
(
  -- Administrative block identifier (matches plot_registry.block_code)
  block_code             STRING  NOT NULL,

  -- Date this observation is valid as-of (source dataset publication date)
  as_of_date             DATE    NOT NULL,

  -- Fraction of farmers in the block who received the MSP (Minimum Support Price)
  -- for their crop (0.0–1.0). Low value → higher economic pressure to burn fast.
  msp_realization_rate   FLOAT64 NOT NULL,

  -- Fraction of farmers in the block who enrolled in any government
  -- subsidised stubble-management equipment scheme (0.0–1.0).
  -- Low value → lower awareness/uptake of formal alternatives.
  subsidy_uptake_rate    FLOAT64 NOT NULL,

  -- Source dataset reference (for lineage / audit)
  source_dataset         STRING,
  source_row_hash        STRING,

  -- ETL metadata
  loaded_at              TIMESTAMP NOT NULL
)
-- No partitioning: table is small (weekly cadence, block-level grain).
-- Single-column clustering on block_code covers all join patterns.
CLUSTER BY block_code
OPTIONS (
  description = 'Block-level socioeconomic pressure signals used as model features. '
                'MSP realization rate and subsidy uptake rate refreshed weekly from '
                'government open-data CSV (Assumption A3). '
                'Joined to plot_residue_readings by block_code in the feature pipeline.'
);
