-- ============================================================
-- hotspot_cluster_members
-- Dataset: burnsignal_scoring
-- Written by: clustering_agent (§3.5)
-- Junction table: one row per (cluster, plot) membership pair.
-- Join to hotspot_clusters on cluster_id; to plot_scores on plot_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_scoring.hotspot_cluster_members`
(
  -- Foreign key → hotspot_clusters.cluster_id
  cluster_id     STRING    NOT NULL,

  -- Foreign key → plot_scores.plot_id (and plot_registry.plot_id)
  plot_id        STRING    NOT NULL,

  -- Score at the time of clustering (snapshot; plot may be re-scored later)
  score_at_clustering FLOAT64,

  -- Pipeline lineage
  pipeline_run_id STRING,
  inserted_at     TIMESTAMP NOT NULL
)
-- No partitioning: table is narrow and small relative to plot_scores.
-- Clustered by cluster_id to support efficient per-cluster member lookups.
CLUSTER BY cluster_id, plot_id
OPTIONS (
  description = 'Junction table mapping hotspot clusters to their member plots. '
                'Read by coordination_agent to resolve worker and equipment assignments '
                'for every plot within a cluster. '
                'Clustered by cluster_id for efficient per-cluster fan-out queries.'
);
