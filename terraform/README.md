# Terraform — GCP DevOps Milestone 4

Provisions the entire environment Milestones 1-3 target: Artifact Registry,
the GKE Autopilot cluster, Cloud SQL, Memorystore, Secret Manager
containers, and the Workload Identity bindings for the Cloud SQL Auth Proxy
sidecar (`k8s/components/gcp-cloudsql-memorystore/`).

```
terraform/
├── versions.tf, provider.tf, variables.tf, main.tf, outputs.tf   # root module
└── modules/
    ├── project_services/     # API enablement
    ├── artifact_registry/
    ├── gke_autopilot/
    ├── cloud_sql/
    ├── memorystore/
    ├── secret_manager/        # secret containers only — see deploy/gcp/secrets.py
    └── workload_identity/     # GSA + Workload Identity bindings, no static keys
```

`tests/infra/test_terraform_config.py` runs the real `terraform` binary
(`fmt`, `init -backend=false`, `validate`) in CI on every PR that touches
this directory — no real GCP project or credentials involved, so it's a
genuine syntax/consistency check, not a hand-rolled one.

## One-time setup

```bash
# GCS bucket for remote state (create once, outside Terraform, to avoid a
# chicken-and-egg problem)
gsutil mb -p PROJECT_ID -l REGION gs://PROJECT_ID-tfstate
gsutil versioning set on gs://PROJECT_ID-tfstate

cd terraform
terraform init -backend-config="bucket=PROJECT_ID-tfstate" -backend-config="prefix=testflow"
```

## Plan, apply, destroy

```bash
export TF_VAR_project_id=PROJECT_ID
export TF_VAR_region=us-central1
export TF_VAR_db_password="$(openssl rand -base64 24)"   # never commit this

terraform plan     # review before applying, every time
terraform apply

# Prove reproducibility (Milestone 4's last task):
terraform destroy
terraform apply
```

After `apply`, wire the outputs into the earlier milestones' placeholders:

| Output | Replaces this placeholder |
|---|---|
| `artifact_registry_url` | `REGION-docker.pkg.dev/PROJECT_ID/testflow` throughout `deploy/gcp/`, `k8s/`, `cloudbuild.yaml` |
| `gke_cluster_id` | `deploy/gcp/clouddeploy.yaml`'s `Target.gke.cluster` |
| `cloud_sql_connection_name` | `CLOUDSQL_INSTANCE` in `k8s/components/gcp-cloudsql-memorystore/` |
| `memorystore_host` | `MEMORYSTORE_HOST` in the same component |
| `workload_identity_service_account` | `WORKLOAD_IDENTITY_GSA` in `service-account.yaml` |
| `secret_ids` | confirms `jwt-secret-key`/`anthropic-api-key` exist before running `deploy/gcp/secrets.py` |

## What's illustrative here

Like `k8s/`, this is real, applyable Terraform aimed at your own GCP
project — nothing here runs `apply` from this repo's CI. `db_password` has
no default (Terraform will prompt or fail without it) so a real secret can
never end up in a committed `.tfvars` file by accident. `secret_manager`
creates empty secret *containers* only; populate real values with
`deploy/gcp/secrets.py` (Milestone 1), never as a Terraform variable.
