variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
  default     = "burnsignal-prod"
}

variable "region" {
  description = "Primary GCP deployment region"
  type        = string
  default     = "asia-south1"
}

variable "pilot_district_code" {
  description = "Pilot district code"
  type        = string
  default     = "PB-SANGRUR"
}
