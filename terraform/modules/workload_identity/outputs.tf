output "service_account_email" {
  description = "WORKLOAD_IDENTITY_GSA — matches the placeholder in k8s/components/gcp-cloudsql-memorystore/service-account.yaml."
  value       = google_service_account.cloudsql_proxy.email
}
