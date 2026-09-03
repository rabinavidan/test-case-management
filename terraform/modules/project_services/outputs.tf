output "enabled_apis" {
  description = "Service names this module enabled, once their google_project_service resources are applied."
  value       = [for s in google_project_service.apis : s.service]
}
