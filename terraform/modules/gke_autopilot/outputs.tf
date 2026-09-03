output "cluster_name" {
  value = google_container_cluster.testflow.name
}

output "cluster_id" {
  description = "projects/PROJECT_ID/locations/REGION/clusters/testflow-gke — matches deploy/gcp/clouddeploy.yaml's Target.gke.cluster."
  value       = google_container_cluster.testflow.id
}

output "workload_identity_pool" {
  value = "${var.project_id}.svc.id.goog"
}
