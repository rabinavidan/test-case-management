variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "secret_ids" {
  description = "Secret Manager secret IDs to create (empty containers — see deploy/gcp/secrets.py:SECRET_NAMES)."
  type        = list(string)
  default     = ["jwt-secret-key", "anthropic-api-key"]
}

variable "accessor_members" {
  description = "IAM members (e.g. \"serviceAccount:...\") granted roles/secretmanager.secretAccessor on every secret in secret_ids."
  type        = list(string)
  default     = []
}
