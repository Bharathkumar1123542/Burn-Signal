# Socioeconomic Data Mapping Schema

This document defines the column mapping between raw government open-data CSV exports and the target BigQuery table `block_socioeconomic` (in dataset `burnsignal_raw`).

## Source to Target Mapping

| Source CSV Column | Target BigQuery Column | Type | Transformation / Description |
|---|---|---|---|
| `sub_district_block` | `block_code` | STRING | Unique block identifier (e.g., `PB-SANGRUR-01`) |
| `reporting_date` | `as_of_date` | DATE | Date of weekly snapshot (`YYYY-MM-DD`) |
| `msp_rate_pct` | `msp_realization_rate` | FLOAT64 | Realized MSP procurement fraction (`0.0` to `1.0`). If missing, calculated as `procurement_actual_mt / procurement_target_mt`. |
| `subsidy_utilization_pct` | `subsidy_uptake_rate` | FLOAT64 | Fractional uptake of Crop Residue Management (CRM) machinery subsidies (`0.0` to `1.0`). If missing, calculated as `crm_machinery_disbursed / crm_machinery_sanctioned`. |
| *system-generated* | `source_file` | STRING | Name of input file parsed (e.g., `msp_subsidy_seed.csv`) |
| *system-generated* | `ingested_at` | TIMESTAMP | UTC timestamp when row was loaded |

## Primary Key & Cadence
- **Primary / Deduplication Key**: `(block_code, as_of_date)`
- **Cadence**: Weekly ingest triggered by Cloud Scheduler.
