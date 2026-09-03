# Milestone 5 (GCP DevOps plan) — dashboard (latency/error-rate/pod-health),
# alerting (5xx spike, GKE crash-loop), an uptime check against the gateway,
# and a budget guard.

resource "google_monitoring_dashboard" "testflow" {
  project        = var.project_id
  dashboard_json = file("${path.module}/dashboard.json")
}

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "TestFlow alerts"
  type         = "email"

  labels = {
    email_address = var.notification_email
  }
}

# 5xx spike on the Cloud Run monolith (Milestone 1).
resource "google_monitoring_alert_policy" "cloud_run_5xx_spike" {
  project      = var.project_id
  display_name = "Cloud Run 5xx spike"
  combiner     = "OR"

  conditions {
    display_name = "5xx request rate above threshold"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold
      duration        = "60s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Pod crash-loop on the GKE microservices deployment (Milestone 2).
resource "google_monitoring_alert_policy" "gke_pod_crash_loop" {
  project      = var.project_id
  display_name = "GKE pod crash-loop"
  combiner     = "OR"

  conditions {
    display_name = "Container restart rate above threshold"
    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND metric.type=\"kubernetes.io/container/restart_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.restart_count_threshold
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_uptime_check_config" "gateway" {
  project      = var.project_id
  display_name = "TestFlow gateway uptime"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path    = "/api/version"
    port    = 443
    use_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.gateway_host
    }
  }
}

# Budget guard — only created when a real billing account is supplied
# (google_billing_budget needs org-level billing access most personal/
# practice projects won't have by default).
resource "google_billing_budget" "testflow" {
  count = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "TestFlow monthly budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = var.budget_amount_usd
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.id]
  }
}
