# Root module — wires every Milestone 4 module together into the full
# TestFlow GCP environment (Milestones 1-3's Cloud Run, GKE Autopilot, and
# Cloud Build/Cloud Deploy targets all provision into this).
module "project_services" {
  source     = "./modules/project_services"
  project_id = var.project_id

  apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com",
    "container.googleapis.com",
    "redis.googleapis.com",
    "clouddeploy.googleapis.com",
    "iam.googleapis.com",
    "monitoring.googleapis.com",
    "billingbudgets.googleapis.com",
  ]
}

module "artifact_registry" {
  source     = "./modules/artifact_registry"
  project_id = var.project_id
  region     = var.region

  depends_on = [module.project_services]
}

module "gke_autopilot" {
  source     = "./modules/gke_autopilot"
  project_id = var.project_id
  region     = var.region

  depends_on = [module.project_services]
}

module "cloud_sql" {
  source      = "./modules/cloud_sql"
  project_id  = var.project_id
  region      = var.region
  tier        = var.cloud_sql_tier
  db_password = var.db_password

  depends_on = [module.project_services]
}

module "memorystore" {
  source         = "./modules/memorystore"
  project_id     = var.project_id
  region         = var.region
  tier           = var.memorystore_tier
  memory_size_gb = var.memorystore_memory_size_gb

  depends_on = [module.project_services]
}

module "secret_manager" {
  source     = "./modules/secret_manager"
  project_id = var.project_id

  depends_on = [module.project_services]
}

module "workload_identity" {
  source     = "./modules/workload_identity"
  project_id = var.project_id
  namespaces = var.environments

  depends_on = [module.project_services, module.gke_autopilot]
}

module "monitoring" {
  source             = "./modules/monitoring"
  project_id         = var.project_id
  notification_email = var.notification_email
  gateway_host       = var.gateway_host
  billing_account_id = var.billing_account_id
  budget_amount_usd  = var.budget_amount_usd

  depends_on = [module.project_services]
}
