"""Socioeconomic Data Loader Service (Implementation.md Section 3.2).

Parses government open-data CSV exports containing block-level MSP realization and
subsidy uptake rates, maps columns per msp_subsidy_schema.md, and upserts rows into
block_socioeconomic keyed on (block_code, as_of_date).
"""

from __future__ import annotations

import csv
import datetime
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Enable direct script execution from any directory
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.common.config import config

logger = logging.getLogger("loader_socioeconomic")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def parse_socioeconomic_row(raw_row: Dict[str, str], source_filename: str) -> Optional[Dict[str, Any]]:
    """Parse and normalize a single CSV row to match block_socioeconomic schema."""
    # Resolve block_code
    block_code = raw_row.get("sub_district_block") or raw_row.get("block_code")
    if not block_code or not block_code.strip():
        return None
    block_code = block_code.strip()

    # Resolve as_of_date
    raw_date = raw_row.get("reporting_date") or raw_row.get("as_of_date")
    if not raw_date:
        return None
    try:
        as_of_date = datetime.date.fromisoformat(raw_date.strip())
    except ValueError:
        logger.warning("Invalid date format '%s' for block %s", raw_date, block_code)
        return None

    # Resolve msp_realization_rate
    msp_rate: Optional[float] = None
    if "msp_rate_pct" in raw_row and raw_row["msp_rate_pct"].strip():
        msp_rate = float(raw_row["msp_rate_pct"])
    elif "procurement_actual_mt" in raw_row and "procurement_target_mt" in raw_row:
        actual = float(raw_row["procurement_actual_mt"])
        target = float(raw_row["procurement_target_mt"])
        msp_rate = actual / target if target > 0 else 0.0

    if msp_rate is not None:
        msp_rate = max(0.0, min(1.0, round(msp_rate, 4)))
    else:
        msp_rate = 0.80  # Default pilot district baseline

    # Resolve subsidy_uptake_rate
    subsidy_rate: Optional[float] = None
    if "subsidy_utilization_pct" in raw_row and raw_row["subsidy_utilization_pct"].strip():
        subsidy_rate = float(raw_row["subsidy_utilization_pct"])
    elif "crm_machinery_disbursed" in raw_row and "crm_machinery_sanctioned" in raw_row:
        disbursed = float(raw_row["crm_machinery_disbursed"])
        sanctioned = float(raw_row["crm_machinery_sanctioned"])
        subsidy_rate = disbursed / sanctioned if sanctioned > 0 else 0.0

    if subsidy_rate is not None:
        subsidy_rate = max(0.0, min(1.0, round(subsidy_rate, 4)))
    else:
        subsidy_rate = 0.70  # Default pilot district baseline

    return {
        "block_code": block_code,
        "as_of_date": as_of_date.isoformat(),
        "msp_realization_rate": msp_rate,
        "subsidy_uptake_rate": subsidy_rate,
        "source_file": source_filename,
        "ingested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def load_socioeconomic_csv(csv_path: Path) -> List[Dict[str, Any]]:
    """Load and parse socioeconomic open-data CSV file."""
    if not csv_path.exists():
        raise FileNotFoundError(f"Socioeconomic CSV file not found at {csv_path}")

    records: Dict[Tuple[str, str], Dict[str, Any]] = {}
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed = parse_socioeconomic_row(row, source_filename=csv_path.name)
            if parsed:
                # Key on (block_code, as_of_date) to enforce upsert idempotency
                key = (parsed["block_code"], parsed["as_of_date"])
                records[key] = parsed

    logger.info("Parsed %d unique (block_code, as_of_date) records from %s", len(records), csv_path.name)
    return list(records.values())


def run_loader(csv_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Run socioeconomic loader and return prepared records."""
    if csv_path is None:
        csv_path = Path(__file__).resolve().parents[2] / "data" / "registry_seed" / "msp_subsidy_seed.csv"

    records = load_socioeconomic_csv(csv_path)
    logger.info("Successfully loaded %d socioeconomic records ready for BigQuery upsert.", len(records))
    return records


if __name__ == "__main__":
    data = run_loader()
    print(f"Sample loaded record: {data[0]}")
