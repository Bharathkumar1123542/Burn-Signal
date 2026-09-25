-- ============================================================
-- equipment_inventory
-- Dataset: burnsignal_registry
-- Static snapshot of stubble-management equipment slots.
-- MVP: populated from CSV (project_overview.md §6.2 scope note).
-- coordination_agent reads and provisionally reserves slots.
-- ============================================================

CREATE TABLE IF NOT EXISTS `${GCP_PROJECT_ID}.burnsignal_registry.equipment_inventory`
(
  -- Unique equipment slot identifier
  equipment_id    STRING    NOT NULL,

  -- 'happy_seeder' | 'rotavator' | 'baler' | 'mulcher' | 'super_sms'
  equipment_type  STRING    NOT NULL,

  -- Location of the equipment / pick-up point (WGS-84)
  location        GEOGRAPHY,

  -- Human-readable location description (village / town name)
  location_desc   STRING,

  -- Availability window for this slot
  slot_start      TIMESTAMP NOT NULL,
  slot_end        TIMESTAMP NOT NULL,

  -- 'available' → free for assignment
  -- 'held'      → provisionally reserved by coordination_agent (§3.6)
  -- 'booked'    → confirmed booking (Phase 2: live booking integration)
  status          STRING    NOT NULL DEFAULT 'available',

  -- If held/booked: the dispatch_task.task_id that holds this slot
  held_by_task_id STRING,

  -- Nearest block codes for proximity filtering
  -- (denormalized from spatial join; updated when inventory refreshed)
  nearest_block_code STRING,

  -- Provider / owner of the equipment (CHC name, PACS, individual)
  provider_name   STRING,
  provider_phone  STRING,

  -- Record metadata
  district_code   STRING    NOT NULL,
  loaded_at       TIMESTAMP NOT NULL,
  last_updated_at TIMESTAMP
)
CLUSTER BY district_code, status, equipment_type
OPTIONS (
  description = 'Stubble-management equipment slot inventory. '
                'MVP: static CSV snapshot (project_overview.md §6.2). '
                'coordination_agent reads available slots within EQUIPMENT_MAX_DISTANCE_KM '
                'and marks matching slots status=''held'' when attaching to a dispatch_task. '
                'Architecture Principle 4: no dispatch_task is created without a valid '
                'equipment_ref (unless status=''escalation_required''). '
                'Clustered by district, status, and type for efficient filtered reads.'
);
