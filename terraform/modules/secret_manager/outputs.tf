output "secret_ids" {
  value = [for s in google_secret_manager_secret.secrets : s.secret_id]
}
