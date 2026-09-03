variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Cloud SQL instance region."
  type        = string
}

variable "tier" {
  description = "Cloud SQL machine tier."
  type        = string
}

variable "db_password" {
  description = "Password for the testflow DB user. Pass via TF_VAR_db_password or a secure tfvars file — never commit a real value."
  type        = string
  sensitive   = true
}
