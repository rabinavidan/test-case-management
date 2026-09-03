"""Unit test for Milestone 5 (GCP DevOps plan) — parses
terraform/modules/monitoring/dashboard.json with the stdlib json module and
checks it covers the milestone's three required dashboard widgets (latency,
error rate, pod health). No terraform binary, no GCP API calls.
"""
import json
import pathlib

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
DASHBOARD_PATH = REPO_ROOT / "terraform/modules/monitoring/dashboard.json"


def _load_dashboard():
    return json.loads(DASHBOARD_PATH.read_text())


def _widget_titles(dashboard):
    return [tile["widget"]["title"] for tile in dashboard["mosaicLayout"]["tiles"]]


def test_dashboard_json_is_valid():
    dashboard = _load_dashboard()
    assert "mosaicLayout" in dashboard
    assert len(dashboard["mosaicLayout"]["tiles"]) >= 1


def test_dashboard_covers_latency():
    titles = _widget_titles(_load_dashboard())
    assert any("latency" in t.lower() for t in titles)


def test_dashboard_covers_error_rate():
    titles = _widget_titles(_load_dashboard())
    assert any("error rate" in t.lower() for t in titles)


def test_dashboard_covers_pod_health():
    titles = _widget_titles(_load_dashboard())
    assert any("pod health" in t.lower() for t in titles)


def test_every_tile_queries_a_real_metric_type():
    dashboard = _load_dashboard()
    for tile in dashboard["mosaicLayout"]["tiles"]:
        data_sets = tile["widget"]["xyChart"]["dataSets"]
        for ds in data_sets:
            filter_str = ds["timeSeriesQuery"]["timeSeriesFilter"]["filter"]
            assert "metric.type=" in filter_str
            assert "resource.type=" in filter_str
