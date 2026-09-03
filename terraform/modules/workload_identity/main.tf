# GSA + Workload Identity bindings for the Cloud SQL Auth Proxy sidecar
# (k8s/components/gcp-cloudsql-memorystore/service-account.yaml) — the KSA
# there impersonates this GSA, no static service-account key ever touches
# the cluster.
resource "google_service_account" "cloudsql_proxy" {
  project      = var.project_id
  account_id   = "cloudsql-proxy-gsa"
  display_name = "Cloud SQL Auth Proxy (Workload Identity)"
}

resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudsql_proxy.email}"
}

# One binding per k8s namespace (one per environment — see
# k8s/overlays/*/namespace.yaml) that runs the cloudsql-proxy KSA.
resource "google_service_account_iam_member" "workload_identity_binding" {
  for_each = toset(var.namespaces)

  service_account_id = google_service_account.cloudsql_proxy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${each.value}/cloudsql-proxy]"
}
