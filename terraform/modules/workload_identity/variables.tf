variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "namespaces" {
  description = "k8s namespaces running the cloudsql-proxy KSA (one per environment — see k8s/overlays/*/namespace.yaml)."
  type        = list(string)
}
