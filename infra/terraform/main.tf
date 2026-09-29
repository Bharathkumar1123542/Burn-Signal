# BurnSignal — Google Cloud Infrastructure (Implementation.md Section 6 & Architecture.md Section 12)

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── 1. BigQuery Datasets ─────────────────────────────────────────────

resource "google_bigquery_dataset" "raw" {
  dataset_id  = "burnsignal_raw"
  description = "Landing zone for raw satellite readings and socioeconomic open-data"
  location    = var.region
}

resource "google_bigquery_dataset" "features" {
  dataset_id  = "burnsignal_features"
  description = "Cleaned and joined plot feature vectors for ML scoring"
  location    = var.region
}

resource "google_bigquery_dataset" "scoring" {
  dataset_id  = "burnsignal_scoring"
  description = "Plot propensity scores, hotspot clusters, and dispatch tasks"
  location    = var.region
}

resource "google_bigquery_dataset" "registry" {
  dataset_id  = "burnsignal_registry"
  description = "Static reference data: plot geometries, KVK workers, equipment inventory"
  location    = var.region
}

# ── 2. Cloud Storage Buckets ─────────────────────────────────────────

resource "google_storage_bucket" "audio" {
  name          = "burnsignal-audio-${var.project_id}"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90 # Retain generated voice scripts for 90 days
    }
  }
}

resource "google_storage_bucket" "imagery" {
  name          = "burnsignal-imagery-${var.project_id}"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true
}

# ── 3. Google Secret Manager Secrets ─────────────────────────────────

resource "google_secret_manager_secret" "ee_key" {
  secret_id = "EE_SERVICE_ACCOUNT_KEY"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "gemini_key" {
  secret_id = "GEMINI_TTS_API_KEY"
  replication {
    auto {}
  }
}

# ── 4. Cloud Run Services / Jobs ─────────────────────────────────────

locals {
  services = [
    "ingestion-satellite",
    "loader-socioeconomic",
    "feature-pipeline",
    "scoring-service",
    "clustering-agent",
    "coordination-agent",
    "dispatch-service",
    "dashboard-api"
  ]
}

resource "google_cloud_run_v2_job" "pipeline_jobs" {
  for_each = toset([for s in local.services : s if s != "dashboard-api"])

  name     = "burnsignal-${each.key}"
  location = var.region

  template {
    template {
      containers {
        image = "gcr.io/${var.project_id}/burnsignal/${each.key}:latest"

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "PILOT_DISTRICT_CODE"
          value = var.pilot_district_code
        }
      }
    }
  }
}
