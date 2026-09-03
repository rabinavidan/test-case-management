# Cloud SQL for PostgreSQL 16 — backs both the Milestone 1 Cloud Run
# monolith and the Milestone 2 GKE microservices (via the Cloud SQL Auth
# Proxy sidecar in k8s/components/gcp-cloudsql-memorystore/).
resource "google_sql_database_instance" "testflow" {
  project             = var.project_id
  name                = "testflow-db"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = false

  settings {
    tier = var.tier
  }
}

resource "google_sql_database" "testflow" {
  project  = var.project_id
  name     = "testflow"
  instance = google_sql_database_instance.testflow.name
}

resource "google_sql_user" "testflow" {
  project  = var.project_id
  name     = "testflow"
  instance = google_sql_database_instance.testflow.name
  password = var.db_password
}
