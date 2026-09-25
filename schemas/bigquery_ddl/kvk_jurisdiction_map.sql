-- ============================================================
-- kvk_jurisdiction_map
-- Dataset: burnsignal_registry
-- Static reference table. Loaded from KVK registry data (A4).
-- Maps administrative blocks → assigned KVK extension workers.
-- PII: worker_phone — access-restricted per architecture.md §9.4.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_registry.kvk_jurisdiction_map`
(
  -- Administrative block code (matches plot_registry.block_code)
  block_code     STRING NOT NULL,

  -- KVK extension worker assigned to this block
  worker_id      STRING NOT NULL,

  -- Human-readable worker name
  worker_name    STRING NOT NULL,

  -- PII: direct phone number for outreach callback reference.
  -- Column-level access restricted to coordination_agent service account
  -- and worker-scoped dashboard view (architecture.md §9.4).
  worker_phone   STRING,

  -- KVK centre this worker is assigned to
  kvk_centre     STRING,

  -- District code for multi-district extension
  district_code  STRING NOT NULL,

  -- Whether this mapping is currently active
  is_active      BOOL   NOT NULL DEFAULT TRUE,

  -- Record metadata
  loaded_at      TIMESTAMP NOT NULL,
  effective_from DATE,
  effective_to   DATE
)
-- Clustered by block_code — primary join key from coordination_agent
CLUSTER BY block_code, district_code
OPTIONS (
  description = 'Static KVK extension worker jurisdiction map. '
                'Maps administrative block codes to the assigned KVK worker. '
                'coordination_agent reads this table to route each cluster''s plots '
                'to the correct extension worker. '
                'worker_phone is PII — column-level IAM policy restricts access '
                'to the coordination_agent service account only (architecture.md §9.4). '
                'For demo/MVP: populated from mock registry in data/registry_seed/.'
);
