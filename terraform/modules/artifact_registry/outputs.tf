output "repository_id" {
  value = google_artifact_registry_repository.testflow.repository_id
}

output "repository_url" {
  description = "REGION-docker.pkg.dev/PROJECT_ID/testflow — the prefix deploy/gcp/*.py and cloudbuild.yaml build image tags from."
  value       = "${google_artifact_registry_repository.testflow.location}-docker.pkg.dev/${google_artifact_registry_repository.testflow.project}/${google_artifact_registry_repository.testflow.repository_id}"
}
