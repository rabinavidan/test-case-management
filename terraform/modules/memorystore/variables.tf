variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Memorystore instance region."
  type        = string
}

variable "tier" {
  description = "Memorystore service tier (BASIC or STANDARD_HA)."
  type        = string
}

variable "memory_size_gb" {
  description = "Instance size in GB."
  type        = number
}
