# Agent Workflow Milestone 5 (issue #189) — alert-to-issue Cloud Function.
#
# Cloud Monitoring publishes one message per incident state change to this
# Pub/Sub topic; the function (scripts/alert_to_issue/) opens/updates/closes
# a GitHub issue accordingly. See scripts/alert_to_issue/main.py and its own
# README note on why functions-framework is never a repo-wide dependency.

resource "google_pubsub_topic" "alerts" {
  project = var.project_id
  name    = "testflow-alerts"
}

resource "google_monitoring_notification_channel" "pubsub" {
  project      = var.project_id
  display_name = "TestFlow alerts (Pub/Sub -> GitHub issue)"
  type         = "pubsub"

  labels = {
    topic = google_pubsub_topic.alerts.id
  }
}

# Empty secret container — populate the real value out-of-band (a GitHub
# PAT or fine-grained token with issues:write on this repo), the same
# pattern as deploy/gcp/secrets.py for JWT_SECRET_KEY/ANTHROPIC_API_KEY.
resource "google_secret_manager_secret" "github_token" {
  project   = var.project_id
  secret_id = "alert-to-issue-github-token"

  replication {
    auto {}
  }
}

resource "google_service_account" "alert_to_issue" {
  project      = var.project_id
  account_id   = "alert-to-issue-fn"
  display_name = "alert-to-issue Cloud Function"
}

resource "google_secret_manager_secret_iam_member" "alert_to_issue_reads_github_token" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.github_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.alert_to_issue.email}"
}

resource "google_storage_bucket" "function_source" {
  project                     = var.project_id
  name                        = "${var.project_id}-alert-to-issue-source"
  location                    = var.region
  uniform_bucket_level_access = true
}

data "archive_file" "alert_to_issue_source" {
  type        = "zip"
  source_dir  = "${path.module}/../../../scripts/alert_to_issue"
  output_path = "${path.module}/.alert_to_issue_source.zip"
  excludes    = ["__pycache__"]
}

resource "google_storage_bucket_object" "alert_to_issue_source" {
  name   = "source-${data.archive_file.alert_to_issue_source.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.alert_to_issue_source.output_path
}

resource "google_cloudfunctions2_function" "alert_to_issue" {
  project     = var.project_id
  name        = "alert-to-issue"
  location    = var.region
  description = "Opens/closes a GitHub issue from a Cloud Monitoring incident Pub/Sub notification."

  build_config {
    runtime     = "python311"
    entry_point = "alert_to_issue"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.alert_to_issue_source.name
      }
    }
  }

  service_config {
    available_memory      = "256M"
    timeout_seconds       = 60
    max_instance_count    = 3
    service_account_email = google_service_account.alert_to_issue.email

    environment_variables = {
      GITHUB_REPOSITORY = var.github_repository
    }

    secret_environment_variables {
      key        = "GITHUB_TOKEN"
      project_id = var.project_id
      secret     = google_secret_manager_secret.github_token.secret_id
      version    = "latest"
    }
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic   = google_pubsub_topic.alerts.id
    retry_policy   = "RETRY_POLICY_RETRY"
  }
}
