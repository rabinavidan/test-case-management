terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # GCS remote state (Milestone 4). Bucket/prefix are supplied at `terraform
  # init` time via -backend-config, not hardcoded here, so this file works
  # unchanged across environments — see terraform/README.md.
  backend "gcs" {}
}
