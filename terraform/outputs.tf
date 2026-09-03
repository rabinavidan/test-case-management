output "artifact_registry_url" {
  value = module.artifact_registry.repository_url
}

output "gke_cluster_id" {
  value = module.gke_autopilot.cluster_id
}

output "cloud_sql_connection_name" {
  value = module.cloud_sql.instance_connection_name
}

output "memorystore_host" {
  value = module.memorystore.host
}

output "workload_identity_service_account" {
  value = module.workload_identity.service_account_email
}

output "secret_ids" {
  value = module.secret_manager.secret_ids
}

output "monitoring_dashboard_id" {
  value = module.monitoring.dashboard_id
}

output "budget_created" {
  description = "true only if billing_account_id was set — see modules/monitoring/variables.tf."
  value       = module.monitoring.budget_created
}
