# Docker repo for all 5 microservice images + the monolith image — the
# same "testflow" repo path deploy/gcp/cloud_run.py, deploy/gcp/gke_images.py,
# and cloudbuild.yaml all build REGION-docker.pkg.dev/PROJECT_ID/testflow/* against.
resource "google_artifact_registry_repository" "testflow" {
  project       = var.project_id
  location      = var.region
  repository_id = "testflow"
  format        = "DOCKER"
  description   = "TestFlow monolith + microservice images"
}
