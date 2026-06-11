"""
E2E tests using Playwright page objects.
Requires BASE_URL env var or --base-url flag.
Run with: pytest tests/test_e2e.py --base-url=https://your-app.vercel.app -v
"""
import pytest
from datetime import datetime
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



# ── Project CRUD ──────────────────────────────────────────────────────────────


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



# ── New Project Modal ─────────────────────────────────────────────────────────


# ── Timestamped project creation (full flow via nav + modal page objects) ─────

def test_create_project_with_timestamp(projects_page: ProjectsPage, new_project_modal: NewProjectModal):
    """
    Full flow:
      1. Navigate to projects page
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
    projects_page.nav_new_btn.click()
    new_project_modal.expect_open()

    # Fill and submit using the NewProjectModal page object
    new_project_modal.submit(name, description)

    # Assert the new project card is visible in the projects grid
    projects_page.expect_project_visible(name)
    projects_page.expect_toast("Project created")

    # Cleanup
    projects_page.delete_project(name)
