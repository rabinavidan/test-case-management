output "host" {
  description = "Matches the MEMORYSTORE_HOST placeholder in k8s/components/gcp-cloudsql-memorystore/kustomization.yaml's REDIS_URL."
  value       = google_redis_instance.testflow.host
}

output "port" {
  value = google_redis_instance.testflow.port
}
