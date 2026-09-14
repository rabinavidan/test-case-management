"""Locust scalability suite for TestFlow's API.

Two different things this measures — not just "does it survive load":

1. **General CRUD throughput/latency under increasing concurrency** — the
   full_crud_flow task exercises the everyday path (project -> suite ->
   test case -> run -> mark result -> read summary -> delete), and
   list_projects gives a pure-read baseline.

2. **The exact race from issue #214** (a concurrent GET on a
   just-cascade-deleted resource can return 200 instead of 404) —
   delete_suite_race reproduces it directly: create a suite, delete it,
   then immediately GET its test cases and assert 404, matching
   java-tests/src/test/java/com/testflow/api/SuitesApiTest.deletingASuiteRemovesIt
   exactly. Reported as a Locust *failure* (via catch_response), not an
   exception, so the failure-rate column in Locust's report is a direct,
   live measurement of how often the race reproduces at a given
   concurrency level — not just "the suite passed" or "it didn't."

Run against the SQLite-backed monolith (needs its own dependency set —
see loadtests/README.md for why this doesn't share a venv with
requirements-test.txt):

    TESTFLOW_DISABLE_RATE_LIMIT=1 uvicorn api.main:app --port 8000 &
    locust -f loadtests/locustfile.py --host http://localhost:8000
"""
import random
import string

import requests
from locust import HttpUser, between, events, task

ADMIN_USERNAME = "loadtest_admin"
ADMIN_PASSWORD = "LoadTest@12345"
ADMIN_EMAIL = "loadtest@example.com"

# Set once by _bootstrap_admin (events.test_start fires once for the whole
# test run, before any simulated user starts), then read-only for every
# HttpUser instance — so the load lands entirely on the CRUD endpoints
# under test, not on repeated register/login calls.
_admin_token = None


def _random_suffix(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


@events.test_start.add_listener
def _bootstrap_admin(environment, **kwargs):
    """Registers the shared admin account (or logs in, if a prior run
    against a persistent DB already created it — /api/auth/register only
    ever succeeds once) exactly once for the whole test."""
    global _admin_token
    host = environment.host

    resp = requests.post(f"{host}/api/auth/register", json={
        "username": ADMIN_USERNAME, "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
    }, timeout=10)
    if resp.status_code not in (201, 403):
        raise RuntimeError(f"Unexpected /api/auth/register response: {resp.status_code} {resp.text}")

    resp = requests.post(f"{host}/api/auth/login", json={
        "username": ADMIN_USERNAME, "password": ADMIN_PASSWORD,
    }, timeout=10)
    resp.raise_for_status()
    _admin_token = resp.json()["access_token"]


class TestFlowUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        if _admin_token is None:
            raise RuntimeError("Admin token not set — events.test_start should run before any user starts")
        self.headers = {"Authorization": f"Bearer {_admin_token}"}

    def _delete_project(self, project_id: int):
        self.client.delete(f"/api/projects/{project_id}", headers=self.headers,
                            name="/api/projects/[id] [delete]")

    @task(3)
    def list_projects(self):
        self.client.get("/api/projects", headers=self.headers, name="/api/projects [list]")

    @task(5)
    def full_crud_flow(self):
        """Create project -> suite -> test case -> run -> mark result ->
        read run summary -> delete. The everyday path most real usage
        looks like."""
        with self.client.post("/api/projects", json={"name": f"LoadTest Project {_random_suffix()}"},
                               headers=self.headers, name="/api/projects [create]",
                               catch_response=True) as resp:
            if resp.status_code != 201:
                resp.failure(f"create project failed: {resp.status_code}")
                return
            project_id = resp.json()["id"]

        with self.client.post(f"/api/projects/{project_id}/suites", json={"name": "Suite"},
                               headers=self.headers, name="/api/projects/[id]/suites [create]",
                               catch_response=True) as resp:
            if resp.status_code != 201:
                resp.failure(f"create suite failed: {resp.status_code}")
                self._delete_project(project_id)
                return
            suite_id = resp.json()["id"]

        # status="active": create_run only pre-creates a TestResult row (what
        # PUT .../results/{tc_id} below updates) for active test cases —
        # the default "draft" status would 404 on the mark-result step.
        with self.client.post(f"/api/suites/{suite_id}/testcases",
                               json={"title": "TC", "priority": "medium", "status": "active"},
                               headers=self.headers,
                               name="/api/suites/[id]/testcases [create]", catch_response=True) as resp:
            if resp.status_code != 201:
                resp.failure(f"create test case failed: {resp.status_code}")
                self._delete_project(project_id)
                return
            tc_id = resp.json()["id"]

        with self.client.post(f"/api/suites/{suite_id}/runs", json={"name": "Run"},
                               headers=self.headers, name="/api/suites/[id]/runs [create]",
                               catch_response=True) as resp:
            if resp.status_code != 201:
                resp.failure(f"create run failed: {resp.status_code}")
                self._delete_project(project_id)
                return
            run_id = resp.json()["id"]

        self.client.put(f"/api/runs/{run_id}/results/{tc_id}", json={"status": "pass"},
                         headers=self.headers, name="/api/runs/[id]/results/[tc_id] [update]")
        self.client.get(f"/api/runs/{run_id}", headers=self.headers,
                         name="/api/runs/[id] [read summary]")

        self._delete_project(project_id)

    @task(2)
    def delete_suite_race(self):
        """issue #214 reproduction: create a suite, delete it, then
        immediately GET its test cases and assert 404 — the same check
        SuitesApiTest.deletingASuiteRemovesIt makes sequentially (where it
        always passes). Under concurrent load it sometimes doesn't."""
        resp = self.client.post("/api/projects", json={"name": f"LoadTest Race {_random_suffix()}"},
                                 headers=self.headers, name="/api/projects [create]")
        if resp.status_code != 201:
            return
        project_id = resp.json()["id"]

        resp = self.client.post(f"/api/projects/{project_id}/suites", json={"name": "RaceSuite"},
                                 headers=self.headers, name="/api/projects/[id]/suites [create]")
        if resp.status_code != 201:
            self._delete_project(project_id)
            return
        suite_id = resp.json()["id"]

        self.client.delete(f"/api/suites/{suite_id}", headers=self.headers,
                            name="/api/suites/[id] [delete]")

        with self.client.get(f"/api/suites/{suite_id}/testcases", headers=self.headers,
                              name="/api/suites/[id]/testcases [race check]",
                              catch_response=True) as resp:
            if resp.status_code == 404:
                resp.success()
            elif resp.status_code == 200:
                resp.failure(
                    f"issue #214 reproduced: GET /api/suites/{suite_id}/testcases returned 200 "
                    f"immediately after DELETE /api/suites/{suite_id} committed"
                )
            else:
                resp.failure(f"unexpected status checking deleted suite: {resp.status_code}")

        self._delete_project(project_id)
