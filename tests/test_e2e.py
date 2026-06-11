"""
E2E tests using Playwright page objects.
Requires BASE_URL env var or --base-url flag.
Run with: pytest tests/test_e2e.py --base-url=https://your-app.vercel.app -v
"""
import pytest
from playwright.sync_api import Page, expect
from tests.pages import ProjectsPage, ProjectPage, SuitePage, NewProjectModal


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


# ── Smoke tests ───────────────────────────────────────────────────────────────

def test_app_loads(projects_page: ProjectsPage):
    expect(projects_page.logo).to_be_visible()
    expect(projects_page.nav_new_btn).to_be_visible()
    expect(projects_page.sidebar).to_be_visible()


def test_projects_page_heading(projects_page: ProjectsPage):
    projects_page.expect_loaded()


def test_logo_navigates_to_projects(projects_page: ProjectsPage, page: Page):
    projects_page.click_logo()
    expect(page).to_have_url(lambda url: "projects" in url or url.endswith("/"))


# ── Project CRUD ──────────────────────────────────────────────────────────────

def test_create_project(projects_page: ProjectsPage):
    projects_page.create_project("E2E Test Project", "Created by Playwright")
    projects_page.expect_project_visible("E2E Test Project")
    projects_page.expect_toast("Project created")
    # Cleanup
    projects_page.delete_project("E2E Test Project")


def test_new_project_modal_opens(projects_page: ProjectsPage):
    projects_page.open_new_project_modal()
    expect(projects_page.modal_title).to_have_text("New Project")
    projects_page.close_modal()


def test_nav_label_on_projects_page(projects_page: ProjectsPage):
    expect(projects_page.nav_new_label).to_have_text("New Project")


# ── Suite CRUD ────────────────────────────────────────────────────────────────

@pytest.fixture()
def temp_project(projects_page: ProjectsPage, project_page: ProjectPage):
    projects_page.create_project("PW Temp Project")
    card = projects_page.project_card("PW Temp Project")
    card.click()
    projects_page.page.wait_for_load_state("networkidle")
    yield project_page
    # Cleanup: go back and delete
    projects_page.goto()
    projects_page.delete_project("PW Temp Project")


def test_create_suite(temp_project: ProjectPage):
    temp_project.create_suite("Login Suite", "Auth tests")
    temp_project.expect_suite_visible("Login Suite")


def test_nav_label_on_project_page(temp_project: ProjectPage):
    expect(temp_project.nav_new_label).to_have_text("New Suite")


# ── Test Case CRUD ────────────────────────────────────────────────────────────

@pytest.fixture()
def temp_suite(projects_page: ProjectsPage, project_page: ProjectPage, suite_page: SuitePage):
    projects_page.create_project("PW Suite Project")
    projects_page.project_card("PW Suite Project").click()
    projects_page.page.wait_for_load_state("networkidle")
    project_page.create_suite("PW Test Suite")
    project_page.suite_card("PW Test Suite").click()
    projects_page.page.wait_for_load_state("networkidle")
    yield suite_page
    # Cleanup
    projects_page.goto()
    projects_page.delete_project("PW Suite Project")


def test_create_test_case(temp_suite: SuitePage):
    temp_suite.create_test_case("Login with valid credentials", status="active", priority="high")
    temp_suite.expect_test_case_visible("Login with valid credentials")


def test_nav_label_on_suite_page(temp_suite: SuitePage):
    expect(temp_suite.nav_new_label).to_have_text("New Test Case")


# ── New Project Modal ─────────────────────────────────────────────────────────

def test_new_project_modal_title(new_project_modal: NewProjectModal, projects_page: ProjectsPage):
    projects_page.open_new_project_modal()
    new_project_modal.expect_open()


def test_new_project_modal_placeholders(new_project_modal: NewProjectModal, projects_page: ProjectsPage):
    projects_page.open_new_project_modal()
    new_project_modal.expect_name_placeholder()
    new_project_modal.expect_description_placeholder()


def test_new_project_modal_cancel(new_project_modal: NewProjectModal, projects_page: ProjectsPage):
    projects_page.open_new_project_modal()
    new_project_modal.cancel()


def test_new_project_modal_dismiss_x(new_project_modal: NewProjectModal, projects_page: ProjectsPage):
    projects_page.open_new_project_modal()
    new_project_modal.dismiss()


def test_new_project_modal_submit(new_project_modal: NewProjectModal, projects_page: ProjectsPage):
    projects_page.open_new_project_modal()
    new_project_modal.submit("Modal Test Project", "Created via modal PO")
    projects_page.expect_project_visible("Modal Test Project")
    projects_page.expect_toast("Project created")
    # Cleanup
    projects_page.delete_project("Modal Test Project")
