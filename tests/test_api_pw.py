"""
Playwright API tests — hit the REST endpoints directly (no browser).
Requires BASE_URL env var or --base-url flag.
Run with: pytest tests/test_api_pw.py --base-url=https://your-app.vercel.app -v
"""
import time
import pytest
from playwright.sync_api import APIRequestContext, Playwright

# Known test prefixes that should be removed after a CI run
_LEAKED_NAMES = ("No Auth", "PW Suite Parent", "API PW Project")


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def api(playwright: Playwright, base_url: str) -> APIRequestContext:
    ctx = playwright.request.new_context(base_url=base_url)
    yield ctx
    ctx.dispose()


@pytest.fixture(scope="session")
def auth_headers(api: APIRequestContext) -> dict:
    """Return Bearer headers for an admin user.

    Tries known stable credentials first so this works against non-empty DBs
    (where the bootstrap /register endpoint is closed).
    """
    # 1. TypeScript E2E test user (created by global-setup.ts on every TS run)
    for username, password in [
        ("testuser_e2e", "Test@12345"),
    ]:
        r = api.post("/api/auth/login", data={"username": username, "password": password})
        if r.ok:
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

    # 2. Fall back to registering a fresh user (only succeeds on empty DBs)
    username = f"apitest_{int(time.time())}"
    r = api.post("/api/auth/register", data={
        "username": username,
        "email": f"{username}@api.test",
        "password": "apipass1",
    })
    if r.status == 400:
        r = api.post("/api/auth/login", data={"username": username, "password": "apipass1"})
    assert r.ok, r.text()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session", autouse=True)
def cleanup_leaked_projects(api: APIRequestContext, auth_headers: dict):
    """Delete known test-named projects that leak when auth checks regress."""
    yield
    try:
        r = api.get("/api/projects", headers=auth_headers)
        if not r.ok:
            return
        for p in r.json():
            if any(p.get("name", "").startswith(prefix) for prefix in _LEAKED_NAMES):
                api.delete(f"/api/projects/{p['id']}", headers=auth_headers)
    except Exception:
        pass


# ── Auth tests ────────────────────────────────────────────────────────────────

def test_register_returns_token(api: APIRequestContext):
    username = f"regtest_{int(time.time())}"
    r = api.post("/api/auth/register", data={
        "username": username,
        "email": f"{username}@test.com",
        "password": "secret123",
    })
    assert r.status == 201
    data = r.json()
    assert "access_token" in data
    assert data["user"]["username"] == username


def test_register_duplicate_username(api: APIRequestContext):
    username = f"duptest_{int(time.time())}"
    api.post("/api/auth/register", data={
        "username": username, "email": f"{username}@test.com", "password": "secret123",
    })
    r = api.post("/api/auth/register", data={
        "username": username, "email": f"{username}2@test.com", "password": "secret123",
    })
    assert r.status == 400


def test_register_duplicate_email(api: APIRequestContext):
    ts = int(time.time())
    email = f"dup{ts}@test.com"
    api.post("/api/auth/register", data={
        "username": f"u1_{ts}", "email": email, "password": "secret123",
    })
    r = api.post("/api/auth/register", data={
        "username": f"u2_{ts}", "email": email, "password": "secret123",
    })
    assert r.status == 400


def test_login_returns_token(api: APIRequestContext):
    ts = int(time.time())
    username = f"logintest_{ts}"
    api.post("/api/auth/register", data={
        "username": username, "email": f"{username}@test.com", "password": "mypass1",
    })
    r = api.post("/api/auth/login", data={"username": username, "password": "mypass1"})
    assert r.status == 200
    assert "access_token" in r.json()


def test_login_wrong_password(api: APIRequestContext):
    ts = int(time.time())
    username = f"wrongpw_{ts}"
    api.post("/api/auth/register", data={
        "username": username, "email": f"{username}@test.com", "password": "correct1",
    })
    r = api.post("/api/auth/login", data={"username": username, "password": "wrong"})
    assert r.status == 401


def test_me_returns_current_user(api: APIRequestContext, auth_headers: dict):
    r = api.get("/api/auth/me", headers=auth_headers)
    assert r.status == 200
    data = r.json()
    assert "username" in data
    assert "id" in data


def test_me_without_token_is_401(api: APIRequestContext):
    r = api.get("/api/auth/me")
    assert r.status == 401


# ── Projects ──────────────────────────────────────────────────────────────────

def test_list_projects_public(api: APIRequestContext):
    r = api.get("/api/projects")
    assert r.status == 200
    assert isinstance(r.json(), list)


def test_create_project_requires_auth(api: APIRequestContext):
    r = api.post("/api/projects", data={"name": "No Auth"})
    assert r.status == 401


def test_create_and_delete_project(api: APIRequestContext, auth_headers: dict):
    r = api.post("/api/projects", data={"name": "API PW Project", "description": "test"}, headers=auth_headers)
    assert r.status == 201
    project_id = r.json()["id"]
    assert r.json()["name"] == "API PW Project"

    r = api.delete(f"/api/projects/{project_id}", headers=auth_headers)
    assert r.status == 204


# ── Suites ────────────────────────────────────────────────────────────────────

@pytest.fixture()
def project(api: APIRequestContext, auth_headers: dict):
    r = api.post("/api/projects", data={"name": "PW Suite Parent"}, headers=auth_headers)
    assert r.ok
    p = r.json()
    yield p
    api.delete(f"/api/projects/{p['id']}", headers=auth_headers)


def test_list_suites_public(api: APIRequestContext, project: dict):
    r = api.get(f"/api/projects/{project['id']}/suites")
    assert r.status == 200
    assert isinstance(r.json(), list)


def test_create_suite(api: APIRequestContext, auth_headers: dict, project: dict):
    r = api.post(f"/api/projects/{project['id']}/suites",
                 data={"name": "Auth Suite"}, headers=auth_headers)
    assert r.status == 201
    assert r.json()["name"] == "Auth Suite"


def test_create_suite_requires_auth(api: APIRequestContext, project: dict):
    r = api.post(f"/api/projects/{project['id']}/suites", data={"name": "No Auth Suite"})
    assert r.status == 401


# ── Test Cases ────────────────────────────────────────────────────────────────

@pytest.fixture()
def suite(api: APIRequestContext, auth_headers: dict, project: dict):
    r = api.post(f"/api/projects/{project['id']}/suites",
                 data={"name": "PW TC Suite"}, headers=auth_headers)
    assert r.ok
    return r.json()


def test_list_testcases_public(api: APIRequestContext, suite: dict):
    r = api.get(f"/api/suites/{suite['id']}/testcases")
    assert r.status == 200
    assert isinstance(r.json(), list)


def test_create_testcase(api: APIRequestContext, auth_headers: dict, suite: dict):
    r = api.post(f"/api/suites/{suite['id']}/testcases",
                 data={"title": "PW Test Case", "status": "active"}, headers=auth_headers)
    assert r.status == 201
    assert r.json()["title"] == "PW Test Case"


def test_create_testcase_requires_auth(api: APIRequestContext, suite: dict):
    r = api.post(f"/api/suites/{suite['id']}/testcases",
                 data={"title": "No Auth TC", "status": "active"})
    assert r.status == 401


# ── Test Runs ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def suite_with_active_cases(api: APIRequestContext, auth_headers: dict, project: dict):
    r = api.post(f"/api/projects/{project['id']}/suites",
                 data={"name": "Run Suite"}, headers=auth_headers)
    s = r.json()
    api.post(f"/api/suites/{s['id']}/testcases",
             data={"title": "TC Active", "status": "active"}, headers=auth_headers)
    api.post(f"/api/suites/{s['id']}/testcases",
             data={"title": "TC Draft", "status": "draft"}, headers=auth_headers)
    return s


def test_create_run_only_includes_active_cases(
        api: APIRequestContext, auth_headers: dict, suite_with_active_cases: dict):
    s = suite_with_active_cases
    r = api.post(f"/api/suites/{s['id']}/runs",
                 data={"name": "PW Run 1"}, headers=auth_headers)
    assert r.status == 201
    data = r.json()
    assert data["name"] == "PW Run 1"
    assert len(data["results"]) == 1  # only the active case
    assert data["results"][0]["status"] == "pending"


def test_list_runs_public(api: APIRequestContext, auth_headers: dict, suite_with_active_cases: dict):
    s = suite_with_active_cases
    api.post(f"/api/suites/{s['id']}/runs", data={"name": "Run A"}, headers=auth_headers)
    r = api.get(f"/api/suites/{s['id']}/runs")
    assert r.status == 200
    assert len(r.json()) >= 1


def test_update_result(api: APIRequestContext, auth_headers: dict, suite_with_active_cases: dict):
    s = suite_with_active_cases
    run = api.post(f"/api/suites/{s['id']}/runs",
                   data={"name": "Run B"}, headers=auth_headers).json()
    tc_id = run["results"][0]["testcase_id"]
    r = api.put(f"/api/runs/{run['id']}/results/{tc_id}",
                data={"status": "pass", "notes": "All good"}, headers=auth_headers)
    assert r.status == 200
    assert r.json()["status"] == "pass"
    assert r.json()["notes"] == "All good"


def test_run_completes_when_all_results_done(
        api: APIRequestContext, auth_headers: dict, suite_with_active_cases: dict):
    s = suite_with_active_cases
    run = api.post(f"/api/suites/{s['id']}/runs",
                   data={"name": "Run C"}, headers=auth_headers).json()
    for res in run["results"]:
        api.put(f"/api/runs/{run['id']}/results/{res['testcase_id']}",
                data={"status": "pass"}, headers=auth_headers)
    r = api.get(f"/api/runs/{run['id']}")
    assert r.status == 200
    assert r.json()["completed_at"] is not None
