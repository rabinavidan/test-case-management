output "dashboard_id" {
  value = google_monitoring_dashboard.testflow.id
}

output "uptime_check_id" {
  value = google_monitoring_uptime_check_config.gateway.uptime_check_id
}

output "budget_created" {
  value = length(google_billing_budget.testflow) > 0
}
