# Secret *containers* only — matches deploy/gcp/secrets.py's SECRET_NAMES
# (jwt-secret-key, anthropic-api-key). Terraform creates the empty secrets;
# actual values are populated out-of-band by deploy/gcp/secrets.py (or by
# hand), never committed or passed as a Terraform variable.
resource "google_secret_manager_secret" "secrets" {
  for_each = toset(var.secret_ids)

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}

# Grants each accessor (e.g. the Cloud Run / GKE runtime service account)
# permission to read secret values — least privilege, no project-wide role.
resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = {
    for pair in setproduct(var.secret_ids, var.accessor_members) :
    "${pair[0]}|${pair[1]}" => { secret_id = pair[0], member = pair[1] }
  }

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret_id].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
