# Memorystore Redis — replaces the in-cluster redis: Service Milestone 2's
# gcp-cloudsql-memorystore component points REDIS_URL at.
resource "google_redis_instance" "testflow" {
  project        = var.project_id
  name           = "testflow-redis"
  region         = var.region
  tier           = var.tier
  memory_size_gb = var.memory_size_gb
  redis_version  = "REDIS_7_0"
}
