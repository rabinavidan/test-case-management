"""
E2E tests using Playwright page objects.
Requires BASE_URL env var or --base-url flag.
Run with: pytest tests/test_e2e.py --base-url=https://your-app.vercel.app -v
"""
import pytest
from datetime import datetime
from playwright.sync_api import Page, expect
from tests.pages import ProjectsPage, ProjectPage, SuitePage, NewProjectModal

pytestmark = pytest.mark.regression


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def projects_page(page: Page, base_url: str) -> ProjectsPage:
    p = ProjectsPage(page, base_url)
    p.goto()
    return p


@pytest.fixture()
def project_page(page: Page, base_url: str) -> ProjectPage:
    return ProjectPage(page, base_url)


@pytest.fixture()
def suite_page(page: Page, base_url: str) -> SuitePage:
    return SuitePage(page, base_url)


@pytest.fixture()
def new_project_modal(page: Page, base_url: str) -> NewProjectModal:
    m = NewProjectModal(page, base_url)
    m.goto()
    return m


@pytest.fixture()
def logged_in(projects_page: ProjectsPage):
    """Log in before write-requiring tests."""
    projects_page.login()
    return projects_page


# ── Smoke tests ───────────────────────────────────────────────────────────────

def test_app_loads(projects_page: ProjectsPage):
    expect(projects_page.logo).to_be_visible()
    expect(projects_page.sidebar).to_be_visible()


def test_projects_page_heading(projects_page: ProjectsPage):
    projects_page.expect_loaded()


def test_logo_navigates_to_projects(projects_page: ProjectsPage, page: Page):
    projects_page.click_logo()
    expect(page).to_have_url(lambda url: "projects" in url or url.endswith("/"))


# ── Project CRUD ──────────────────────────────────────────────────────────────

def test_create_project(logged_in: ProjectsPage):
    logged_in.create_project("E2E Test Project", "Created by Playwright")
    logged_in.expect_project_visible("E2E Test Project")
    logged_in.expect_toast("Project created")
    # Cleanup
    logged_in.delete_project("E2E Test Project")


def test_new_project_modal_opens(logged_in: ProjectsPage):
    logged_in.open_new_project_modal()
    expect(logged_in.modal_title).to_have_text("New Project")
    logged_in.close_modal()


def test_nav_label_on_projects_page(logged_in: ProjectsPage):
    expect(logged_in.nav_new_label).to_have_text("New Project")


# ── Suite CRUD ────────────────────────────────────────────────────────────────

@pytest.fixture()
def temp_project(logged_in: ProjectsPage, project_page: ProjectPage):
    logged_in.create_project("PW Temp Project")
    card = logged_in.project_card("PW Temp Project")
    card.click()
    logged_in.page.wait_for_load_state("networkidle")
    yield project_page
    # Cleanup: go back and delete
    logged_in.goto()
    logged_in.delete_project("PW Temp Project")


def test_create_suite(temp_project: ProjectPage):
    temp_project.create_suite("Login Suite", "Auth tests")
    temp_project.expect_suite_visible("Login Suite")


def test_nav_label_on_project_page(temp_project: ProjectPage):
    expect(temp_project.nav_new_label).to_have_text("New Suite")


# ── Test Case CRUD ────────────────────────────────────────────────────────────

@pytest.fixture()
def temp_suite(logged_in: ProjectsPage, project_page: ProjectPage, suite_page: SuitePage):
    logged_in.create_project("PW Suite Project")
    logged_in.project_card("PW Suite Project").click()
    logged_in.page.wait_for_load_state("networkidle")
    project_page.create_suite("PW Test Suite")
    project_page.suite_card("PW Test Suite").click()
    logged_in.page.wait_for_load_state("networkidle")
    yield suite_page
    # Cleanup
    logged_in.goto()
    logged_in.delete_project("PW Suite Project")


def test_create_test_case(temp_suite: SuitePage):
    temp_suite.create_test_case("Login with valid credentials", status="active", priority="high")
    temp_suite.expect_test_case_visible("Login with valid credentials")


def test_nav_label_on_suite_page(temp_suite: SuitePage):
    expect(temp_suite.nav_new_label).to_have_text("New Test Case")


# ── New Project Modal ─────────────────────────────────────────────────────────

def test_new_project_modal_title(new_project_modal: NewProjectModal, logged_in: ProjectsPage):
    logged_in.open_new_project_modal()
    new_project_modal.expect_open()


def test_new_project_modal_placeholders(new_project_modal: NewProjectModal, logged_in: ProjectsPage):
    logged_in.open_new_project_modal()
    new_project_modal.expect_name_placeholder()
    new_project_modal.expect_description_placeholder()


def test_new_project_modal_cancel(new_project_modal: NewProjectModal, logged_in: ProjectsPage):
    logged_in.open_new_project_modal()
    new_project_modal.cancel()


def test_new_project_modal_dismiss_x(new_project_modal: NewProjectModal, logged_in: ProjectsPage):
    logged_in.open_new_project_modal()
    new_project_modal.dismiss()


def test_new_project_modal_submit(new_project_modal: NewProjectModal, logged_in: ProjectsPage):
    logged_in.open_new_project_modal()
    new_project_modal.submit("Modal Test Project", "Created via modal PO")
    logged_in.expect_project_visible("Modal Test Project")
    logged_in.expect_toast("Project created")
    # Cleanup
    logged_in.delete_project("Modal Test Project")


# ── Timestamped project creation (full flow via nav + modal page objects) ─────

def test_create_project_with_timestamp(logged_in: ProjectsPage, new_project_modal: NewProjectModal):
    """
    Full flow:
      1. Log in
      2. Click New Project via nav label
      3. Fill name & description with current timestamp
      4. Submit via NewProjectModal page object
      5. Assert the new card appears in the projects grid
      6. Cleanup
    """
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    name = f"project name with time stamp {ts}"
    description = f"project description with time stamp {ts}"

    # Open modal via the nav button (same button as #nav-new-label)
    logged_in.nav_new_btn.click()
    new_project_modal.expect_open()

    # Fill and submit using the NewProjectModal page object
    new_project_modal.submit(name, description)

    # Assert the new project card is visible in the projects grid
    logged_in.expect_project_visible(name)
    logged_in.expect_toast("Project created")

    # Cleanup
    logged_in.delete_project(name)
