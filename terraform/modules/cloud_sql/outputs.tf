output "instance_connection_name" {
  description = "PROJECT_ID:REGION:INSTANCE — matches the Cloud SQL Auth Proxy sidecar's connection string in k8s/components/gcp-cloudsql-memorystore/ and deploy/gcp/cloud-run-service.yaml."
  value       = google_sql_database_instance.testflow.connection_name
}

output "database_name" {
  value = google_sql_database.testflow.name
}
