"""Centralized configuration module for BurnSignal.

Loads and validates all 14 environment variables defined in implementation.md Section 2,
with support for .env files, standard OS environment variables, and optional Google Secret Manager.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

# Load optional .env file if available
try:
    from dotenv import load_dotenv
    # Look for .env at project root
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
except ImportError:
    pass


class BurnSignalConfig(BaseModel):
    """Runtime configuration for BurnSignal services."""

    # Project and District Identifiers
    GCP_PROJECT_ID: str = Field(
        default_factory=lambda: os.getenv("GCP_PROJECT_ID", "burnsignal-prod"),
        description="GCP Project identifier"
    )
    PILOT_DISTRICT_CODE: str = Field(
        default_factory=lambda: os.getenv("PILOT_DISTRICT_CODE", "PB-SANGRUR"),
        description="District code for pilot operations"
    )

    # BigQuery Dataset Names
    BQ_DATASET_RAW: str = Field(
        default_factory=lambda: os.getenv("BQ_DATASET_RAW", "burnsignal_raw"),
        description="Landing zone dataset for raw satellite and socioeconomic data"
    )
    BQ_DATASET_FEATURES: str = Field(
        default_factory=lambda: os.getenv("BQ_DATASET_FEATURES", "burnsignal_features"),
        description="Dataset for cleaned, joined feature tables"
    )
    BQ_DATASET_SCORING: str = Field(
        default_factory=lambda: os.getenv("BQ_DATASET_SCORING", "burnsignal_scoring"),
        description="Dataset for model scores, clusters, and dispatch tasks"
    )
    BQ_DATASET_REGISTRY: str = Field(
        default_factory=lambda: os.getenv("BQ_DATASET_REGISTRY", "burnsignal_registry"),
        description="Dataset for static/reference registry tables"
    )

    # Machine Learning & Clustering Settings
    VERTEX_ENDPOINT_ID: Optional[str] = Field(
        default_factory=lambda: os.getenv("VERTEX_ENDPOINT_ID", None),
        description="Vertex AI AutoML prediction endpoint resource ID"
    )
    BURN_SCORE_THRESHOLD: float = Field(
        default_factory=lambda: float(os.getenv("BURN_SCORE_THRESHOLD", "0.6")),
        description="Probability threshold for clustering high-risk plots"
    )
    CLUSTER_EPS_METERS: int = Field(
        default_factory=lambda: int(os.getenv("CLUSTER_EPS_METERS", "500")),
        description="DBSCAN epsilon distance in meters"
    )
    CLUSTER_MIN_SAMPLES: int = Field(
        default_factory=lambda: int(os.getenv("CLUSTER_MIN_SAMPLES", "3")),
        description="DBSCAN minimum samples per cluster"
    )
    EQUIPMENT_MAX_DISTANCE_KM: float = Field(
        default_factory=lambda: float(os.getenv("EQUIPMENT_MAX_DISTANCE_KM", "15.0")),
        description="Maximum distance for matching available equipment"
    )

    # Vernacular Voice Dispatch & Cloud Storage
    TTS_LANGUAGE_CODE: str = Field(
        default_factory=lambda: os.getenv("TTS_LANGUAGE_CODE", "pa-IN"),
        description="Vernacular language code for Gemini TTS (pa-IN or hi-IN)"
    )
    GCS_AUDIO_BUCKET: str = Field(
        default_factory=lambda: os.getenv("GCS_AUDIO_BUCKET", "burnsignal-audio"),
        description="Cloud Storage bucket for generated audio voice files"
    )
    GCS_IMAGERY_BUCKET: str = Field(
        default_factory=lambda: os.getenv("GCS_IMAGERY_BUCKET", "burnsignal-imagery"),
        description="Cloud Storage bucket for satellite imagery tiles"
    )

    # Secret Credentials (Injected at runtime or via Secret Manager)
    EE_SERVICE_ACCOUNT_KEY: Optional[str] = Field(
        default_factory=lambda: os.getenv("EE_SERVICE_ACCOUNT_KEY", None),
        description="Earth Engine service account private key (JSON string or path)"
    )
    GEMINI_TTS_API_KEY: Optional[str] = Field(
        default_factory=lambda: os.getenv("GEMINI_TTS_API_KEY", None),
        description="API key for Gemini TTS generation"
    )

    def get_secret(self, secret_id: str, default: Optional[str] = None) -> Optional[str]:
        """Fetch a secret from Google Secret Manager if configured, otherwise env var."""
        env_val = os.getenv(secret_id)
        if env_val:
            return env_val
        try:
            from google.cloud import secretmanager  # type: ignore
            client = secretmanager.SecretManagerServiceClient()
            name = f"projects/{self.GCP_PROJECT_ID}/secrets/{secret_id}/versions/latest"
            response = client.access_secret_version(name=name)
            return response.payload.data.decode("UTF-8")
        except Exception:
            return default


# Global singleton instance
config = BurnSignalConfig()
