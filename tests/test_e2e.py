"""
E2E tests using Playwright. Requires BASE_URL env var (defaults to production URL).
Run with: pytest tests/test_e2e.py --base-url=https://your-app.vercel.app
"""
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="session")
def base_url_override():
    import os
    return os.getenv("BASE_URL", "")


def test_home_loads(page: Page, base_url):
    page.goto(base_url)
    expect(page.locator("text=TestFlow")).to_be_visible()


def test_projects_page_visible(page: Page, base_url):
    page.goto(f"{base_url}/#projects")
    expect(page.locator("text=Projects")).to_be_visible()


def test_create_and_delete_project(page: Page, base_url):
    page.goto(base_url)
    page.wait_for_load_state("networkidle")

    # Create project
    page.get_by_role("button", name="New Project").first.click()
    page.get_by_placeholder("My Awesome Project").fill("E2E Test Project")
    page.get_by_role("button", name="Create Project").click()
    expect(page.get_by_text("E2E Test Project")).to_be_visible()

    # Delete project
    project_card = page.locator("text=E2E Test Project").locator("..")
    project_card.hover()
    page.get_by_role("button").filter(has_text="").nth(-1).click()
    page.on("dialog", lambda d: d.accept())
    page.wait_for_timeout(500)
