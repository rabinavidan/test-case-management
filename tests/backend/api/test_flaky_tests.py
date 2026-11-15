import pytest


@pytest.fixture()
def suite(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    return s, headers, client


def _record_run(client, headers, suite_id, tc_title, status):
    """Starts a run (seeding a pending result for every active test case in the suite)
    and, if given, marks the named test case's result with `status`."""
    run = client.post(f"/api/suites/{suite_id}/runs", json={"name": f"Run for {tc_title}"}, headers=headers).json()
    result = next(r for r in run["results"] if r["test_case"]["title"] == tc_title)
    if status:
        client.put(f"/api/runs/{run['id']}/results/{result['testcase_id']}",
                    json={"status": status}, headers=headers)
    return run


def test_flaky_tests_suite_not_found(auth_client):
    client, headers = auth_client
    r = client.get("/api/suites/999/flaky-tests", headers=headers)
    assert r.status_code == 404


def test_flaky_tests_empty_suite(auth_client, suite):
    s, headers, client = suite
    r = client.get(f"/api/suites/{s['id']}/flaky-tests", headers=headers)
    assert r.status_code == 200
    assert r.json() == {"suite_id": s["id"], "flaky_cases": []}


def test_stable_test_case_is_not_flagged(auth_client, suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "Stable", "status": "active"}, headers=headers)

    for _ in range(4):
        _record_run(client, headers, s["id"], "Stable", "pass")

    r = client.get(f"/api/suites/{s['id']}/flaky-tests", headers=headers)
    assert r.status_code == 200
    assert r.json()["flaky_cases"] == []


def test_single_flip_is_not_flagged(auth_client, suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "OneFlip", "status": "active"}, headers=headers)

    _record_run(client, headers, s["id"], "OneFlip", "pass")
    _record_run(client, headers, s["id"], "OneFlip", "fail")

    r = client.get(f"/api/suites/{s['id']}/flaky-tests", headers=headers)
    assert r.json()["flaky_cases"] == []


def test_repeated_flip_flops_are_flagged(auth_client, suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "Flaky", "status": "active"}, headers=headers)

    for status in ("pass", "fail", "pass", "fail"):
        _record_run(client, headers, s["id"], "Flaky", status)

    r = client.get(f"/api/suites/{s['id']}/flaky-tests", headers=headers)
    assert r.status_code == 200
    cases = r.json()["flaky_cases"]
    assert len(cases) == 1
    case = cases[0]
    assert case["title"] == "Flaky"
    assert case["executions"] == 4
    assert case["flip_count"] == 3
    assert case["flakiness_score"] == 0.75
    assert case["history"] == ["pass", "fail", "pass", "fail"]


def test_skips_are_excluded_from_flip_count(auth_client, suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "SkipsIgnored", "status": "active"}, headers=headers)

    for status in ("pass", "skip", "fail", "skip", "pass", "fail"):
        _record_run(client, headers, s["id"], "SkipsIgnored", status)

    r = client.get(f"/api/suites/{s['id']}/flaky-tests", headers=headers)
    cases = r.json()["flaky_cases"]
    assert len(cases) == 1
    # Only the 4 pass/fail results count; the 2 skips are dropped entirely.
    assert cases[0]["history"] == ["pass", "fail", "pass", "fail"]
    assert cases[0]["executions"] == 4
    assert cases[0]["flip_count"] == 3


def test_results_sorted_by_flakiness_score_descending(auth_client, suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "LessFlaky", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "MoreFlaky", "status": "active"}, headers=headers)

    # LessFlaky: pass, fail, pass, pass, pass, fail -> 3 flips / 6 = 0.5
    for status in ("pass", "fail", "pass", "pass", "pass", "fail"):
        _record_run(client, headers, s["id"], "LessFlaky", status)
    # MoreFlaky: pass, fail, pass, fail -> 3 flips / 4 = 0.75
    for status in ("pass", "fail", "pass", "fail"):
        _record_run(client, headers, s["id"], "MoreFlaky", status)

    r = client.get(f"/api/suites/{s['id']}/flaky-tests", headers=headers)
    cases = r.json()["flaky_cases"]
    assert [c["title"] for c in cases] == ["MoreFlaky", "LessFlaky"]


def test_flaky_tests_does_not_require_auth(suite):
    # Matches list_testcases/project_analytics: a read-only, unauthenticated GET.
    s, _, client = suite
    r = client.get(f"/api/suites/{s['id']}/flaky-tests")
    assert r.status_code == 200
