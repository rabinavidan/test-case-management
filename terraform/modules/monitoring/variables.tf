variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "notification_email" {
  description = "Email address alert policies and the budget notify."
  type        = string
}

variable "gateway_host" {
  description = "Hostname the uptime check hits (the GKE Ingress host for k8s/base/gateway.yaml, or the Cloud Run URL's host)."
  type        = string
}

variable "error_rate_threshold" {
  description = "5xx requests/sec above which the alert fires."
  type        = number
  default     = 5
}

variable "restart_count_threshold" {
  description = "Container restarts (in the alignment period) above which the crash-loop alert fires."
  type        = number
  default     = 3
}

variable "billing_account_id" {
  description = "Billing account (billingAccounts/XXXXXX-XXXXXX-XXXXXX) for the budget guard. Leave empty (default) to skip creating a budget — most personal/practice GCP setups don't have org-level billing access."
  type        = string
  default     = ""
}

variable "budget_amount_usd" {
  description = "Monthly budget amount in USD."
  type        = number
  default     = 50
}

variable "region" {
  description = "Region for the alert-to-issue Cloud Function and its source bucket."
  type        = string
}

variable "github_repository" {
  description = "owner/repo the alert-to-issue Cloud Function opens GitHub issues in (e.g. \"rabinavidan/test-case-management\")."
  type        = string
}
