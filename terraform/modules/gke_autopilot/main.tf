# GKE Autopilot cluster for the Milestone 2 microservices deployment
# (k8s/overlays/{staging,regression,preprod,prod}).
resource "google_container_cluster" "testflow" {
  project  = var.project_id
  name     = "testflow-gke"
  location = var.region

  enable_autopilot = true

  # Autopilot manages node config; deletion_protection defaults to true in
  # recent provider versions — explicit here so `terraform destroy` (the
  # "tear down + re-apply to prove reproducibility" task) actually works.
  deletion_protection = false
}
