"""GraphQL endpoint (`/graphql`, api/gql/) — auth, queries, mutations,
REST parity, N+1 batching, and the query-cost guardrails."""
import pytest
from sqlalchemy import event

from tests.api.conftest import engine


def gql(client, query, variables=None, headers=None):
    res = client.post("/graphql", json={"query": query, "variables": variables or {}}, headers=headers or {})
    assert res.status_code == 200, res.text
    return res.json()


def error_codes(body):
    return [e.get("extensions", {}).get("code") for e in body.get("errors", [])]


CREATE_PROJECT = """
mutation($name: String!) { createProject(input: {name: $name, description: "d"}) { id name description createdAt } }
"""
CREATE_SUITE = """
mutation($pid: ID!, $name: String!) { createSuite(projectId: $pid, input: {name: $name}) { id projectId name } }
"""
CREATE_TC = """
mutation($sid: ID!, $title: String!, $status: TestCaseStatus!) {
  createTestCase(suiteId: $sid, input: {title: $title, status: $status, priority: HIGH}) { id title status priority suiteId }
}
"""
CREATE_RUN = """
mutation($sid: ID!, $env: String) { createRun(suiteId: $sid, input: {name: "GQL Run", environmentKey: $env}) { id name environmentKey } }
"""
UPDATE_RESULT = """
mutation($rid: ID!, $tid: ID!, $status: ResultStatus!, $notes: String) {
  updateResult(runId: $rid, testCaseId: $tid, input: {status: $status, notes: $notes}) {
    id status notes executedAt testCase { id title }
  }
}
"""


def seed(client, headers, *, projects=1, suites=1, cases=2):
    """Build a tree through GraphQL mutations; returns the created IDs."""
    tree = []
    for p in range(projects):
        pid = gql(client, CREATE_PROJECT, {"name": f"P{p}"}, headers)["data"]["createProject"]["id"]
        suite_ids = []
        for s in range(suites):
            sid = gql(client, CREATE_SUITE, {"pid": pid, "name": f"S{p}.{s}"}, headers)["data"]["createSuite"]["id"]
            tc_ids = [
                gql(client, CREATE_TC, {"sid": sid, "title": f"TC{c}", "status": "ACTIVE"}, headers)
                ["data"]["createTestCase"]["id"]
                for c in range(cases)
            ]
            suite_ids.append((sid, tc_ids))
        tree.append((pid, suite_ids))
    return tree


# ─── Auth ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nope"}, {"Authorization": "Basic abc"}])
def test_requires_a_valid_bearer_token(client, headers):
    body = gql(client, "{ me { id } projects { id } }", headers=headers)
    assert body["data"] is None
    assert set(error_codes(body)) == {"UNAUTHENTICATED"}


def test_me_returns_the_caller(auth_client):
    client, headers = auth_client
    me = gql(client, "{ me { id username role } }", headers=headers)["data"]["me"]
    assert me["username"] == "testuser"
    assert me["role"] == "admin"


def test_executor_cannot_run_admin_mutations(executor_client):
    client, headers = executor_client
    body = gql(client, CREATE_PROJECT, {"name": "nope"}, headers)
    assert error_codes(body) == ["FORBIDDEN"]


def test_executor_can_create_runs_and_record_results(auth_client, executor_client):
    client, admin = auth_client
    _, executor = executor_client
    [(_, [(sid, [tc_id, _])])] = seed(client, admin)
    run = gql(client, CREATE_RUN, {"sid": sid}, executor)["data"]["createRun"]
    res = gql(client, UPDATE_RESULT, {"rid": run["id"], "tid": tc_id, "status": "PASS"}, executor)
    assert res["data"]["updateResult"]["status"] == "pass"


# ─── Queries ─────────────────────────────────────────────────────────────────

def test_nested_query_returns_the_whole_tree(auth_client):
    client, headers = auth_client
    [(pid, [(sid, tc_ids)])] = seed(client, headers, cases=3)
    body = gql(client, """
      query($id: ID!) { project(id: $id) { id name suites { id name project { id } testCases { id title status priority suite { id } } } } }
    """, {"id": pid}, headers)
    project = body["data"]["project"]
    assert project["id"] == pid
    [suite] = project["suites"]
    assert suite["id"] == sid and suite["project"]["id"] == pid
    # Newest first, same as GET /api/suites/{id}/testcases.
    assert [tc["id"] for tc in suite["testCases"]] == list(reversed(tc_ids))
    assert {tc["status"] for tc in suite["testCases"]} == {"active"}
    assert {tc["priority"] for tc in suite["testCases"]} == {"high"}
    assert {tc["suite"]["id"] for tc in suite["testCases"]} == {sid}


def test_test_case_status_filter(auth_client):
    client, headers = auth_client
    [(_, [(sid, _)])] = seed(client, headers, cases=2)
    gql(client, CREATE_TC, {"sid": sid, "title": "Draft one", "status": "DRAFT"}, headers)
    body = gql(client, """
      query($id: ID!) { suite(id: $id) { all: testCases { id } drafts: testCases(status: DRAFT) { title } } }
    """, {"id": sid}, headers)
    assert len(body["data"]["suite"]["all"]) == 3
    assert body["data"]["suite"]["drafts"] == [{"title": "Draft one"}]


@pytest.mark.parametrize("field", ["project", "suite", "testCase", "run"])
@pytest.mark.parametrize("bad_id", ["99999", "not-a-number"])
def test_lookup_by_unknown_id_returns_null(auth_client, field, bad_id):
    client, headers = auth_client
    body = gql(client, f'{{ {field}(id: "{bad_id}") {{ id }} }}', headers=headers)
    assert body == {"data": {field: None}}


def test_projects_search_and_pagination(auth_client):
    client, headers = auth_client
    for name in ["Alpha", "Beta", "Alphabet", "Gamma"]:
        gql(client, CREATE_PROJECT, {"name": name}, headers)
    q = "query($s: String, $l: Int!, $o: Int!) { projects(search: $s, limit: $l, offset: $o) { name } }"
    names = lambda v: [p["name"] for p in gql(client, q, v, headers)["data"]["projects"]]  # noqa: E731
    assert names({"s": "alpha", "l": 20, "o": 0}) == ["Alphabet", "Alpha"]
    assert names({"s": None, "l": 2, "o": 0}) == ["Gamma", "Alphabet"]
    assert names({"s": None, "l": 2, "o": 2}) == ["Beta", "Alpha"]


def test_projects_limit_is_capped(auth_client, monkeypatch):
    from api.gql import graph as gql_schema

    client, headers = auth_client
    monkeypatch.setattr(gql_schema, "MAX_PAGE_SIZE", 2)
    for name in "ABC":
        gql(client, CREATE_PROJECT, {"name": name}, headers)
    assert len(gql(client, "{ projects(limit: 50) { id } }", headers=headers)["data"]["projects"]) == 2


@pytest.mark.parametrize("args", ["limit: 0", "offset: -1"])
def test_projects_rejects_bad_paging(auth_client, args):
    client, headers = auth_client
    assert error_codes(gql(client, f"{{ projects({args}) {{ id }} }}", headers=headers)) == ["BAD_REQUEST"]


def test_datetimes_carry_a_utc_offset(auth_client):
    client, headers = auth_client
    created_at = gql(client, CREATE_PROJECT, {"name": "tz"}, headers)["data"]["createProject"]["createdAt"]
    assert created_at.endswith("+00:00")


# ─── Mutations ───────────────────────────────────────────────────────────────

def test_create_suite_under_missing_project_is_not_found(auth_client):
    client, headers = auth_client
    body = gql(client, CREATE_SUITE, {"pid": "99999", "name": "orphan"}, headers)
    assert error_codes(body) == ["NOT_FOUND"]
    assert body["errors"][0]["message"] == "Project not found"


def test_mutation_with_non_numeric_id_is_bad_request(auth_client):
    client, headers = auth_client
    assert error_codes(gql(client, CREATE_SUITE, {"pid": "abc", "name": "x"}, headers)) == ["BAD_REQUEST"]


def test_create_run_with_environment_and_unknown_environment(auth_client):
    client, headers = auth_client
    [(_, [(sid, _)])] = seed(client, headers)
    run = gql(client, CREATE_RUN, {"sid": sid, "env": "staging"}, headers)["data"]["createRun"]
    assert run["environmentKey"] == "staging"
    assert error_codes(gql(client, CREATE_RUN, {"sid": sid, "env": "mars"}, headers)) == ["BAD_REQUEST"]


def test_invalid_enum_value_is_rejected_before_execution(auth_client):
    client, headers = auth_client
    body = gql(client, UPDATE_RESULT, {"rid": "1", "tid": "1", "status": "PASSED"}, headers)
    assert body["data"] is None
    assert "PASSED" in body["errors"][0]["message"]


def test_update_result_updates_summary_and_completes_run(auth_client):
    client, headers = auth_client
    [(_, [(sid, [tc1, tc2])])] = seed(client, headers)
    run_id = gql(client, CREATE_RUN, {"sid": sid}, headers)["data"]["createRun"]["id"]
    summary_q = "query($id: ID!) { run(id: $id) { completedAt summary { total passed failed pending passRate } } }"

    before = gql(client, summary_q, {"id": run_id}, headers)["data"]["run"]
    assert before["summary"] == {"total": 2, "passed": 0, "failed": 0, "pending": 2, "passRate": None}

    res = gql(client, UPDATE_RESULT, {"rid": run_id, "tid": tc1, "status": "PASS", "notes": "ok"}, headers)
    updated = res["data"]["updateResult"]
    assert updated["status"] == "pass" and updated["notes"] == "ok"
    assert updated["executedAt"] is not None
    assert updated["testCase"]["id"] == tc1
    gql(client, UPDATE_RESULT, {"rid": run_id, "tid": tc2, "status": "FAIL"}, headers)

    after = gql(client, summary_q, {"id": run_id}, headers)["data"]["run"]
    assert after["summary"] == {"total": 2, "passed": 1, "failed": 1, "pending": 0, "passRate": 50.0}
    assert after["completedAt"] is not None


def test_update_result_for_unknown_result_is_not_found(auth_client):
    client, headers = auth_client
    body = gql(client, UPDATE_RESULT, {"rid": "999", "tid": "999", "status": "SKIP"}, headers)
    assert error_codes(body) == ["NOT_FOUND"]


def test_update_test_case_changes_only_the_given_fields(auth_client):
    client, headers = auth_client
    [(_, [(_, [tc_id, _])])] = seed(client, headers)
    body = gql(client, """
      mutation($id: ID!) { updateTestCase(id: $id, input: {title: "Renamed", priority: LOW, status: null}) { title status priority } }
    """, {"id": tc_id}, headers)
    # `status: null` is ignored, same rule as PUT /api/testcases/{id}.
    assert body["data"]["updateTestCase"] == {"title": "Renamed", "status": "active", "priority": "low"}


def test_delete_test_case(auth_client):
    client, headers = auth_client
    [(_, [(_, [tc_id, _])])] = seed(client, headers)
    assert gql(client, "mutation($id: ID!) { deleteTestCase(id: $id) }", {"id": tc_id}, headers)["data"] == {"deleteTestCase": True}
    assert gql(client, "query($id: ID!) { testCase(id: $id) { id } }", {"id": tc_id}, headers)["data"] == {"testCase": None}
    again = gql(client, "mutation($id: ID!) { deleteTestCase(id: $id) }", {"id": tc_id}, headers)
    assert error_codes(again) == ["NOT_FOUND"]


# ─── Parity with REST ────────────────────────────────────────────────────────

def test_run_matches_the_rest_representation(auth_client):
    client, headers = auth_client
    [(_, [(sid, [tc1, _])])] = seed(client, headers)
    run_id = gql(client, CREATE_RUN, {"sid": sid, "env": "prod"}, headers)["data"]["createRun"]["id"]
    gql(client, UPDATE_RESULT, {"rid": run_id, "tid": tc1, "status": "FAIL", "notes": "boom"}, headers)

    rest = client.get(f"/api/runs/{run_id}", headers=headers).json()
    graph = gql(client, """
      query($id: ID!) { run(id: $id) { id name suiteId environmentKey createdAt createdBy { username }
        results { id status notes testCase { id title } } } }
    """, {"id": run_id}, headers)["data"]["run"]

    assert int(graph["id"]) == rest["id"]
    assert graph["name"] == rest["name"]
    assert int(graph["suiteId"]) == rest["suite_id"]
    assert graph["environmentKey"] == rest["environment_key"]
    assert graph["createdBy"]["username"] == rest["created_by_username"] == "testuser"
    assert graph["createdAt"] == rest["created_at"]
    as_rest = lambda r: (int(r["id"]), r["status"], r["notes"], int(r["testCase"]["id"]), r["testCase"]["title"])  # noqa: E731
    assert sorted(map(as_rest, graph["results"])) == sorted(
        (r["id"], r["status"], r["notes"], r["test_case"]["id"], r["test_case"]["title"]) for r in rest["results"]
    )


def test_update_result_broadcasts_to_the_runs_websocket_room(auth_client):
    client, headers = auth_client
    [(_, [(sid, [tc1, _])])] = seed(client, headers)
    run_id = gql(client, CREATE_RUN, {"sid": sid}, headers)["data"]["createRun"]["id"]
    token = headers["Authorization"].removeprefix("Bearer ")
    with client.websocket_connect(f"/ws/runs/{run_id}?token={token}") as ws:
        gql(client, UPDATE_RESULT, {"rid": run_id, "tid": tc1, "status": "PASS"}, headers)
        msg = ws.receive_json()
    assert msg["type"] == "result_updated"
    assert msg["testcase_id"] == int(tc1)
    assert msg["updated_by"] == "testuser"


# ─── Batching (N+1) ──────────────────────────────────────────────────────────

class _StatementCounter:
    def __init__(self):
        self.count = 0

    def __call__(self, *args, **kwargs):
        self.count += 1

    def __enter__(self):
        event.listen(engine, "before_cursor_execute", self)
        return self

    def __exit__(self, *exc):
        event.remove(engine, "before_cursor_execute", self)


TREE_QUERY = "{ projects { suites { testCases { id } runs { results { testCase { id } } summary { total } } } } }"


def _statements_for_tree(client, headers, projects, expected_total):
    tree = seed(client, headers, projects=projects, suites=2, cases=2)
    for _, suites in tree:
        for sid, _ in suites:
            gql(client, CREATE_RUN, {"sid": sid}, headers)
    with _StatementCounter() as counter:
        body = gql(client, TREE_QUERY, headers=headers)
    assert "errors" not in body
    assert len(body["data"]["projects"]) == expected_total
    return counter.count


def test_nested_query_statement_count_does_not_grow_with_data(auth_client):
    client, headers = auth_client
    small = _statements_for_tree(client, headers, projects=1, expected_total=1)
    large = _statements_for_tree(client, headers, projects=4, expected_total=5)  # 10 suites, 20 cases total
    # One query per nesting level (plus auth), regardless of row count.
    assert large == small
    assert large <= 8


# ─── Guardrails ──────────────────────────────────────────────────────────────

def test_query_depth_limit(auth_client):
    client, headers = auth_client
    deep = "{ projects { suites { project { suites { project { suites { project { suites { project { suites { project { id } } } } } } } } } } } }"
    body = gql(client, deep, headers=headers)
    assert "exceeds maximum operation depth" in body["errors"][0]["message"]


def test_alias_limit(auth_client):
    client, headers = auth_client
    many = "{ " + " ".join(f"a{i}: me {{ id }}" for i in range(16)) + " }"
    body = gql(client, many, headers=headers)
    assert "aliases found" in body["errors"][0]["message"]


def test_unexpected_errors_are_masked(auth_client, monkeypatch):
    from api.gql import graph as gql_schema

    client, headers = auth_client

    def boom(*_):
        raise RuntimeError("secret internals")

    monkeypatch.setattr(gql_schema.Project, "from_model", staticmethod(boom))
    gql(client, CREATE_PROJECT, {"name": "x"}, headers)
    body = gql(client, "{ projects { id } }", headers=headers)
    assert "secret internals" not in str(body)
    assert body["errors"][0]["message"] == "Unexpected error."


def test_get_queries_are_not_accepted(auth_client):
    client, headers = auth_client
    res = client.get("/graphql", params={"query": "{ me { id } }"}, headers=headers)
    assert "testuser" not in res.text


def test_introspection_is_disabled_in_production():
    from api.gql.graph import build_schema

    query = "{ __schema { queryType { name } } }"
    assert build_schema(production=False).execute_sync(query).errors is None
    assert build_schema(production=True).execute_sync(query).errors


def test_graphiql_ide_is_served_outside_production(client):
    res = client.get("/graphql", headers={"Accept": "text/html"})
    assert res.status_code == 200
    assert "graphiql" in res.text.lower()
