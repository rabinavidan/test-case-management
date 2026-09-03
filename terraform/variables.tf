variable "project_id" {
  description = "GCP project ID to provision TestFlow's infrastructure into."
  type        = string
}

variable "region" {
  description = "GCP region for regional resources (Artifact Registry, GKE Autopilot, Cloud SQL, Memorystore)."
  type        = string
  default     = "us-central1"
}

variable "environments" {
  description = "Namespaces Workload Identity binds the cloudsql-proxy KSA in — must match k8s/overlays/*."
  type        = list(string)
  default     = ["testflow-staging", "testflow-regression", "testflow-preprod", "testflow-prod"]
}

variable "db_password" {
  description = "Password for the Cloud SQL testflow user. Pass via TF_VAR_db_password — never commit a real value or put it in a tracked tfvars file."
  type        = string
  sensitive   = true
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier. Defaults to the smallest tier for practice/low-cost use."
  type        = string
  default     = "db-f1-micro"
}

variable "memorystore_tier" {
  description = "Memorystore service tier."
  type        = string
  default     = "BASIC"
}

variable "memorystore_memory_size_gb" {
  description = "Memorystore instance size in GB."
  type        = number
  default     = 1
}
