variable "project_id" {
  description = "GCP project ID to enable APIs in."
  type        = string
}

variable "apis" {
  description = "Service names to enable (e.g. run.googleapis.com)."
  type        = list(string)
}
