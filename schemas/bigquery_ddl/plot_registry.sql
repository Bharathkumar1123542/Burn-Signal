-- ============================================================
-- plot_registry
-- Dataset: burnsignal_registry
-- Static reference table. Loaded once per pilot district
-- from GIS shapefile / GeoJSON (Assumption A1).
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_registry.plot_registry`
(
  -- Primary key. Format: <district_code>-<block_code>-<seq>
  -- e.g. SAN-NW-001
  plot_id          STRING  NOT NULL,

  -- Foreign key → block_socioeconomic.block_code
  block_code       STRING  NOT NULL,

  -- Plot boundary polygon (WGS-84)
  geometry         GEOGRAPHY,

  -- Pre-harvest NDVI baseline used for residue differencing (§3.1)
  baseline_ndvi    FLOAT64,

  -- Date the baseline NDVI was captured
  baseline_date    DATE,

  -- Sowing / harvest deadlines used to derive time-pressure features (§3.3)
  -- Schema: { "sowing_deadline": "YYYY-MM-DD", "harvest_estimate": "YYYY-MM-DD" }
  crop_calendar    JSON,

  -- Plot size in hectares (model feature, §6 architecture.md)
  plot_area_hectares FLOAT64,

  -- Farmer contact reference (PII — column-level access restricted
  -- to coordination_agent service account per architecture.md §9.4)
  farmer_name      STRING,

  -- PII — access-restricted (see above)
  farmer_phone     STRING,

  -- ISO 3166-2 district code for multi-district partitioning readiness
  district_code    STRING  NOT NULL,

  -- Record metadata
  loaded_at        TIMESTAMP NOT NULL,
  source_file      STRING
)
OPTIONS (
  description = 'Static farm-plot registry for the pilot district. '
                'Contains plot boundaries, NDVI baselines, crop calendars, '
                'and farmer contact references (PII — column-level access restricted). '
                'Loaded once from GIS shapefile; updated each season.'
);
