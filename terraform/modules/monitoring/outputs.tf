output "dashboard_id" {
  value = google_monitoring_dashboard.testflow.id
}

output "uptime_check_id" {
  value = google_monitoring_uptime_check_config.gateway.uptime_check_id
}

output "budget_created" {
  value = length(google_billing_budget.testflow) > 0
}

output "alerts_topic" {
  description = "Pub/Sub topic Cloud Monitoring publishes incident notifications to."
  value       = google_pubsub_topic.alerts.id
}

output "alert_to_issue_function_uri" {
  value = google_cloudfunctions2_function.alert_to_issue.url
}

output "github_token_secret_id" {
  description = "Populate this secret's value with a GitHub token (issues:write on github_repository) — see deploy/gcp/secrets.py for the population pattern."
  value       = google_secret_manager_secret.github_token.secret_id
}
