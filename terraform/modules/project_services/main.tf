# Enables the APIs Milestones 1-3 depend on (see GCP SERVICE MAP in the
# GCP DevOps practice plan). disable_on_destroy = false so `terraform
# destroy` doesn't disable APIs other projects/tooling in this same project
# might also depend on.
resource "google_project_service" "apis" {
  for_each = toset(var.apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
