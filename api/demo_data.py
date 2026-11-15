"""Seed data for the demo projects created by api/routers/demo.py."""
import random
from datetime import datetime, timedelta

from . import models

# ─── Demo seed ───────────────────────────────────────────────────────────────

_DEMO_SUITES = [
    ("Data Ingestion", "Kafka and GCP Pub/Sub message ingestion", [
        ("Kafka topic receives alert event", "active", "high"),
        ("GCP Pub/Sub message published successfully", "active", "high"),
        ("Malformed message is rejected with error", "active", "medium"),
        ("Message retry on transient failure", "active", "medium"),
        ("Dead-letter queue captures failed messages", "active", "low"),
    ]),
    ("Alerts Logic Engine", "Core alert evaluation and rule matching", [
        ("Alert triggers when threshold exceeded", "active", "high"),
        ("No alert when value is within threshold", "active", "high"),
        ("Multi-condition rule evaluates correctly", "active", "high"),
        ("Alert deduplication prevents duplicate notifications", "active", "medium"),
        ("Alert severity mapped correctly (low/med/high)", "active", "medium"),
        ("Stale alert expires after TTL", "active", "low"),
    ]),
    ("Rule Validator", "Alert rule syntax and validation", [
        ("Valid rule passes validation", "active", "high"),
        ("Missing required field returns 400", "active", "high"),
        ("Invalid operator type rejected", "active", "medium"),
        ("Threshold out of range rejected", "active", "medium"),
        ("Rule with valid schedule accepted", "active", "low"),
    ]),
    ("Scheduler Service", "Scheduled alert job execution", [
        ("Scheduled job fires at correct interval", "active", "high"),
        ("Job does not fire when disabled", "active", "high"),
        ("Missed job recovers on restart", "active", "medium"),
        ("Concurrent jobs do not duplicate alerts", "active", "medium"),
        ("Job logs execution timestamp", "active", "low"),
    ]),
    ("Notification Engine", "Notification dispatch orchestration", [
        ("Notification routed to correct channel", "active", "high"),
        ("UI-only alert does not trigger email", "active", "high"),
        ("Daily digest batches alerts correctly", "active", "medium"),
        ("Weekly digest contains correct date range", "active", "medium"),
        ("Failed notification retried up to 3 times", "active", "medium"),
    ]),
    ("Email Engine", "Email delivery via SMTP/SendGrid", [
        ("Alert email sent with correct subject", "active", "high"),
        ("Email contains alert details and timestamp", "active", "high"),
        ("Unsubscribed user does not receive email", "active", "high"),
        ("Bounce handling marks address as invalid", "active", "medium"),
        ("SendGrid API failure falls back to SMTP", "active", "low"),
    ]),
    ("Data Persistence", "MongoDB, Elasticsearch, Solr, Redis, BigQuery storage", [
        ("User preferences saved to MongoDB", "active", "high"),
        ("Alert indexed in Elasticsearch", "active", "high"),
        ("Funding data queryable via Solr", "active", "medium"),
        ("Historical data retrievable from BigQuery", "active", "medium"),
        ("Cache hit served from Redis", "active", "high"),
        ("Redis cache invalidated on data update", "active", "medium"),
        ("Elasticsearch query returns ranked results", "active", "low"),
    ]),
    ("Notification Center UI", "Client-side notification center", [
        ("Notification center shows unread count", "active", "high"),
        ("Clicking notification marks it as read", "active", "high"),
        ("Real-time update appears without page reload", "active", "medium"),
        ("Empty state shown when no notifications", "active", "low"),
        ("Notification links to correct resource", "active", "medium"),
    ]),
]


def _seed_demo_runs(db, project_id):
    """Create one completed test run per suite with randomly distributed pass/fail/skip."""
    suites = db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id).all()
    run_number = 1
    for suite in suites:
        cases = db.query(models.TestCase).filter(
            models.TestCase.suite_id == suite.id,
            models.TestCase.status == "active",
        ).all()
        if not cases:
            continue
        run = models.TestRun(
            suite_id=suite.id,
            name=f"Demo Run #{run_number}",
            created_at=datetime.utcnow() - timedelta(hours=random.randint(1, 48)),
        )
        db.add(run)
        db.flush()
        executed = datetime.utcnow() - timedelta(minutes=random.randint(5, 60))
        for tc in cases:
            result_status = random.choices(
                ["pass", "pass", "pass", "fail", "skip"],
                weights=[60, 10, 10, 15, 5],
                k=1,
            )[0]
            result = models.TestResult(
                run_id=run.id,
                testcase_id=tc.id,
                status=result_status,
                executed_at=executed,
            )
            db.add(result)
        run.completed_at = datetime.utcnow() - timedelta(minutes=random.randint(1, 5))
        run_number += 1


_TESTFLOW_SUITES = [
    ("Project Management", "Create, edit, and delete projects", [
        ("Create project with name and description", "active", "high"),
        ("Project name is required on creation", "active", "high"),
        ("Delete project removes all suites and cases", "active", "high"),
        ("Project list shows newest first", "active", "medium"),
        ("Project count updates after creation", "active", "medium"),
        ("Filter projects by name", "active", "medium"),
        ("Sort projects by oldest first", "active", "low"),
    ]),
    ("Test Suite Management", "Create, list, and delete test suites", [
        ("Create suite within a project", "active", "high"),
        ("Suite name is required", "active", "high"),
        ("Delete suite removes all test cases", "active", "high"),
        ("Suites listed newest first", "active", "medium"),
        ("Suite count shown on project stats card", "active", "medium"),
    ]),
    ("Test Case Management", "Add, update, and remove test cases", [
        ("Create test case with title and priority", "active", "high"),
        ("Test case title is required", "active", "high"),
        ("Update test case status to deprecated", "active", "medium"),
        ("Delete test case removes from suite", "active", "medium"),
        ("Priority badge renders for high/medium/low", "active", "low"),
        ("Active cases appear in new test run", "active", "high"),
        ("Deprecated cases excluded from new run", "active", "medium"),
    ]),
    ("Test Run Execution", "Start runs and record results", [
        ("Create run generates pending results for active cases", "active", "high"),
        ("Mark result as pass updates run status", "active", "high"),
        ("Mark result as fail updates run status", "active", "high"),
        ("Mark result as skip updates run status", "active", "medium"),
        ("Run marked complete when all results non-pending", "active", "high"),
        ("Notes saved on result update", "active", "medium"),
        ("Pass rate calculated correctly on stats", "active", "high"),
    ]),
    ("REST API Endpoints", "FastAPI backend contract tests", [
        ("GET /api/projects returns list", "active", "high"),
        ("POST /api/projects creates project", "active", "high"),
        ("DELETE /api/projects/{id} returns 204", "active", "high"),
        ("GET /api/projects/{id}/suites returns list", "active", "high"),
        ("POST /api/suites/{id}/testcases creates case", "active", "high"),
        ("PUT /api/testcases/{id} updates fields", "active", "medium"),
        ("GET /api/projects/{id}/stats returns correct counts", "active", "high"),
        ("POST /api/suites/{id}/runs creates results", "active", "high"),
        ("PUT /api/runs/{id}/results/{tc} updates result", "active", "high"),
        ("404 returned for missing resources", "active", "medium"),
    ]),
    ("UI / SPA Behaviour", "Vanilla JS single-page app tests", [
        ("Hash routing navigates to correct view", "active", "high"),
        ("Breadcrumb updates on navigation", "active", "medium"),
        ("Sidebar project list updates after create", "active", "high"),
        ("Toast appears on successful create", "active", "medium"),
        ("Toast appears on delete", "active", "medium"),
        ("Modal closes on Cancel click", "active", "medium"),
        ("Modal closes on backdrop click", "active", "low"),
        ("New Project button hidden on project view", "active", "low"),
    ]),
    ("Playwright E2E Tests", "Browser automation with page object model", [
        ("Navigate to projects page on load", "active", "high"),
        ("Create project via New Project modal", "active", "high"),
        ("New project appears in sidebar and grid", "active", "high"),
        ("Open project and view stats", "active", "high"),
        ("Create suite from project page", "active", "high"),
        ("Create test case from suite page", "active", "high"),
        ("Start test run and mark all results", "active", "high"),
        ("Pass rate updates after completing run", "active", "medium"),
        ("Delete project via trash icon", "active", "medium"),
    ]),
    ("CI / CD Pipeline", "GitHub Actions and Vercel deployment checks", [
        ("API tests pass on pull request", "active", "high"),
        ("E2E tests run on push to main", "active", "high"),
        ("Job summary renders test report table", "active", "medium"),
        ("Vercel preview URL deployed per PR", "active", "high"),
        ("Production URL updated on merge to main", "active", "high"),
        ("Database migrations run on cold start", "active", "medium"),
        ("Static files served with correct cache headers", "active", "low"),
    ]),
]


_PLAYWRIGHT_SUITES = [
    ("Projects API — test_projects.py", "pytest · FastAPI TestClient · CRUD coverage", [
        ("test_list_projects_empty — GET /api/projects returns 200 with empty list", "active", "high"),
        ("test_create_project — POST /api/projects creates project and returns 201", "active", "high"),
        ("test_list_projects_after_create — list reflects newly created projects", "active", "medium"),
        ("test_delete_project — DELETE /api/projects/{id} removes project and returns 200", "active", "high"),
        ("test_delete_project_not_found — DELETE non-existent project returns 404", "active", "medium"),
    ]),
    ("Suites API — test_suites.py", "pytest · suite CRUD and project stats endpoint", [
        ("test_list_suites_empty — GET /api/projects/{id}/suites returns empty list", "active", "high"),
        ("test_create_suite — POST creates suite and returns correct suite_id and project_id", "active", "high"),
        ("test_create_suite_project_not_found — POST to missing project returns 404", "active", "medium"),
        ("test_delete_suite — DELETE suite removes it from the project", "active", "high"),
        ("test_project_stats — GET /api/projects/{id}/stats returns correct counts", "active", "medium"),
    ]),
    ("Test Cases API — test_testcases.py", "pytest · test case CRUD including update", [
        ("test_create_testcase — POST creates test case with title, status, priority", "active", "high"),
        ("test_list_testcases — GET /api/suites/{id}/testcases lists all cases", "active", "high"),
        ("test_update_testcase — PATCH updates title and status correctly", "active", "high"),
        ("test_delete_testcase — DELETE removes test case from suite", "active", "high"),
        ("test_testcase_suite_not_found — POST to missing suite returns 404", "active", "medium"),
    ]),
    ("Test Runs API — test_runs.py", "pytest · run creation, result recording, auto-complete", [
        ("test_create_run — POST /api/suites/{id}/runs creates run with active cases only", "active", "high"),
        ("test_list_runs — GET /api/suites/{id}/runs returns all runs for suite", "active", "medium"),
        ("test_get_run — GET /api/runs/{id} returns run with embedded test results", "active", "high"),
        ("test_update_result — PATCH /api/results/{id} records pass/fail/skip with notes", "active", "high"),
        ("test_run_completes_when_all_results_done — run.completed_at set after last result", "active", "high"),
    ]),
    ("E2E Smoke Tests — test_e2e.py", "Playwright · app loads, navigation, logo", [
        ("test_app_loads — logo, nav button, and sidebar visible on load", "active", "high"),
        ("test_projects_page_heading — Projects heading rendered on home page", "active", "high"),
        ("test_logo_navigates_to_projects — clicking logo returns to projects view", "active", "medium"),
    ]),
    ("E2E Project CRUD — test_e2e.py", "Playwright · project creation modal and table", [
        ("test_create_project — open modal, fill name, submit, verify project in table", "active", "high"),
        ("test_new_project_modal_opens — sidebar + button both open the modal", "active", "high"),
        ("test_nav_label_on_projects_page — nav button label shows New Project", "active", "low"),
    ]),
    ("E2E Suite & Test Case CRUD — test_e2e.py", "Playwright · suite and test case creation flows", [
        ("test_create_suite — navigate to project, open modal, create suite", "active", "high"),
        ("test_nav_label_on_project_page — nav button label shows New Suite", "active", "low"),
        ("test_create_test_case — open suite, add test case with status and priority", "active", "high"),
        ("test_nav_label_on_suite_page — nav button label shows New Test Case", "active", "low"),
    ]),
    ("E2E New Project Modal — test_e2e.py", "Playwright · modal form validation and dismiss", [
        ("test_new_project_modal_title — modal title text is New Project", "active", "medium"),
        ("test_new_project_modal_placeholders — name and description inputs have correct placeholders", "active", "medium"),
        ("test_new_project_modal_cancel — Cancel button closes modal overlay", "active", "medium"),
        ("test_new_project_modal_dismiss_x — X button dismisses modal overlay", "active", "medium"),
        ("test_new_project_modal_submit — submit creates project and modal closes", "active", "high"),
    ]),
    ("E2E Full Flow — test_e2e.py", "Playwright · end-to-end create project with timestamp", [
        ("test_create_project_with_timestamp — navigate, open modal, fill timestamped name, submit, verify", "active", "high"),
    ]),
    ("Page Objects — tests/e2e/pages/", "POM classes: BasePage, ProjectsPage, ProjectPage, SuitePage, NewProjectModal", [
        ("BasePage — logo, breadcrumb, nav-new-btn, sidebar-projects locators present", "active", "high"),
        ("BasePage — modal_overlay, modal_box, modal_title, modal_body locators present", "active", "high"),
        ("BasePage — toast_inner locator captures success and error messages", "active", "medium"),
        ("ProjectsPage — project_row locator finds row by project name", "active", "high"),
        ("ProjectsPage — delete_btn_for triggers confirm dialog and removes row", "active", "high"),
        ("ProjectPage — suite_card locator finds suite by name", "active", "high"),
        ("ProjectPage — stats cards (suites, cases, runs, pass rate) all accessible", "active", "medium"),
        ("SuitePage — test_case_card locator finds case by title", "active", "high"),
        ("SuitePage — start_run_btn and run_card accessible for run flows", "active", "medium"),
        ("NewProjectModal — name_input, description_input, create_btn, cancel_btn accessible", "active", "high"),
        ("All page objects use data-testid attributes as first-choice locator strategy", "active", "high"),
    ]),
]
