"""No database work on the event loop.

A blocking DB call inside an `async def` handler runs on the event loop. With
the connection pool busy it waits there for a connection — up to the 30 s
pool timeout — while the requests holding every connection need that same
loop to finish and give them back. The server deadlocks until the timeout
fires, then cascades. Sync handlers run in FastAPI's threadpool; async ones
must hand their DB work to it.

This listens to every pool checkout and records whether an event loop was
running on that thread, across each async handler that touches the DB.
"""
import asyncio

import pytest
from sqlalchemy import event
from sqlalchemy.pool import Pool


@pytest.fixture()
def checkouts():
    seen = []

    def on_checkout(dbapi_conn, record, proxy):
        try:
            asyncio.get_running_loop()
            seen.append("event loop")
        except RuntimeError:
            seen.append("worker thread")

    event.listen(Pool, "checkout", on_checkout)
    yield seen
    event.remove(Pool, "checkout", on_checkout)


@pytest.fixture()
def run_ids(auth_client):
    client, headers = auth_client
    pid = client.post("/api/projects", json={"name": "Loop"}, headers=headers).json()["id"]
    sid = client.post(f"/api/projects/{pid}/suites", json={"name": "S"}, headers=headers).json()["id"]
    tid = client.post(f"/api/suites/{sid}/testcases", json={"title": "T", "priority": "high", "status": "active"}, headers=headers).json()["id"]
    rid = client.post(f"/api/suites/{sid}/runs", json={"name": "R"}, headers=headers).json()["id"]
    return sid, tid, rid


def test_async_handlers_never_check_out_a_connection_on_the_event_loop(auth_client, run_ids, checkouts, monkeypatch):
    client, headers = auth_client
    sid, tid, rid = run_ids
    token = headers["Authorization"].split()[1]
    checkouts.clear()  # only the calls below

    # Live result update (REST), which also broadcasts to WebSocket subscribers.
    assert client.put(f"/api/runs/{rid}/results/{tid}", json={"status": "fail", "notes": "n"}, headers=headers).status_code == 200

    # WebSocket admission: token check and run lookup.
    with client.websocket_connect(f"/ws/runs/{rid}?token={token}") as ws:
        ws.send_text('{"type":"ping"}')
        assert "pong" in ws.receive_text()

    # AI endpoints, with no provider configured: each still reads the DB first.
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client.post(f"/api/runs/{rid}/triage", headers=headers)
    client.post(f"/api/suites/{sid}/testcases/generate", json={"feature_description": "login"}, headers=headers)
    assert client.post(
        f"/api/suites/{sid}/testcases/generate/save",
        json=[{"title": "Generated", "priority": "medium"}], headers=headers,
    ).status_code == 200

    assert checkouts, "the calls above should have used the database"
    assert "event loop" not in checkouts, checkouts
