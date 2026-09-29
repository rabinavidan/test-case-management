"""Run-collaboration WebSocket (`/ws/runs/{run_id}`) — protocol in
shared/ws_protocol.py, contract in docs/asyncapi.yaml."""
import json
import time

import pytest
from starlette.websockets import WebSocketDisconnect

from shared import ws_protocol


def _token(headers):
    return headers["Authorization"].removeprefix("Bearer ")


def _make_run(client, headers, name="WS"):
    p = client.post("/api/projects", json={"name": f"{name} Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": f"{name} Suite"}, headers=headers).json()
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC", "status": "active"}, headers=headers).json()
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": f"{name} Run"}, headers=headers).json()
    return s, tc, run


def _ws_url(run_id, headers):
    return f"/ws/runs/{run_id}?token={_token(headers)}"


def test_websocket_legacy_ping_pong(auth_client):
    client, headers = auth_client
    _, _, run = _make_run(client, headers)
    with client.websocket_connect(_ws_url(run["id"], headers)) as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_websocket_json_ping_pong(auth_client):
    client, headers = auth_client
    _, _, run = _make_run(client, headers)
    with client.websocket_connect(_ws_url(run["id"], headers)) as ws:
        before = int(time.time())
        ws.send_text(json.dumps({"type": "ping"}))
        msg = ws.receive_json()
        assert msg["type"] == "pong"
        assert msg["ts"] >= before


@pytest.mark.parametrize("frame, detail_fragment", [
    ("not json", "expected JSON"),
    ("[1, 2]", "'type' field"),
    ('{"no_type": 1}', "'type' field"),
    ('{"type": "subscribe"}', "Unsupported message type"),
])
def test_websocket_bad_frame_gets_error_and_keeps_socket_open(auth_client, frame, detail_fragment):
    client, headers = auth_client
    _, _, run = _make_run(client, headers)
    with client.websocket_connect(_ws_url(run["id"], headers)) as ws:
        ws.send_text(frame)
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert detail_fragment in msg["detail"]
        # Still in the room: the keep-alive path answers.
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


@pytest.mark.parametrize("query", ["", "?token=", "?token=not-a-jwt", "?token=a.b.c"])
def test_websocket_rejects_missing_or_invalid_token_with_4401(auth_client, query):
    client, headers = auth_client
    _, _, run = _make_run(client, headers)
    with client.websocket_connect(f"/ws/runs/{run['id']}{query}") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == ws_protocol.CLOSE_UNAUTHORIZED


def test_websocket_rejects_expired_token_with_4401(auth_client, monkeypatch):
    client, headers = auth_client
    _, _, run = _make_run(client, headers)
    token = _token(headers)
    monkeypatch.setattr(time, "time", lambda: 10**12)  # far past the token's exp
    with client.websocket_connect(f"/ws/runs/{run['id']}?token={token}") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == ws_protocol.CLOSE_UNAUTHORIZED


def test_websocket_rejects_token_of_deleted_user_with_4401(auth_client, executor_client):
    client, admin_headers = auth_client
    _, exec_headers = executor_client
    _, _, run = _make_run(client, admin_headers)
    exec_id = client.get("/api/auth/me", headers=exec_headers).json()["id"]
    assert client.delete(f"/api/users/{exec_id}", headers=admin_headers).status_code in (200, 204)
    with client.websocket_connect(_ws_url(run["id"], exec_headers)) as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == ws_protocol.CLOSE_UNAUTHORIZED


def test_websocket_unknown_run_closes_with_4404(auth_client):
    client, headers = auth_client
    with client.websocket_connect(_ws_url(99999, headers)) as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == ws_protocol.CLOSE_RUN_NOT_FOUND


def test_websocket_broadcasts_result_update(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "WS Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "WS Suite"}, headers=headers).json()
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC", "status": "active"}, headers=headers).json()
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "WS Run"}, headers=headers).json()

    with client.websocket_connect(_ws_url(run["id"], headers)) as ws:
        r = client.put(
            f"/api/runs/{run['id']}/results/{tc['id']}",
            json={"status": "pass", "notes": "looks good"},
            headers=headers,
        )
        assert r.status_code == 200

        msg = ws.receive_json()
        assert msg["type"] == "result_updated"
        assert msg["testcase_id"] == tc["id"]
        assert msg["status"] == "pass"
        assert msg["notes"] == "looks good"
        assert msg["updated_by"] == "testuser"
        assert msg["run_completed"] is True


def test_websocket_only_broadcasts_to_matching_run(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "WS Project 2"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "WS Suite 2"}, headers=headers).json()
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC", "status": "active"}, headers=headers).json()
    run_a = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run A"}, headers=headers).json()
    run_b = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run B"}, headers=headers).json()

    with client.websocket_connect(_ws_url(run_b["id"], headers)) as ws_b:
        client.put(
            f"/api/runs/{run_a['id']}/results/{tc['id']}",
            json={"status": "fail"},
            headers=headers,
        )
        # The other run's room shouldn't receive this broadcast; confirm the
        # connection is still alive by using the ping/pong keep-alive path.
        ws_b.send_text("ping")
        assert ws_b.receive_text() == "pong"


def test_websocket_disconnect_leaves_the_room(auth_client):
    """A closed socket is removed from its room, so later broadcasts don't
    try to write to it."""
    from api.main import ws_manager

    client, headers = auth_client
    _, _, run = _make_run(client, headers)
    with client.websocket_connect(_ws_url(run["id"], headers)) as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
        assert run["id"] in ws_manager._rooms
    # Disconnect is processed on the server's side of the TestClient portal.
    for _ in range(50):
        if run["id"] not in ws_manager._rooms:
            break
        time.sleep(0.02)
    assert run["id"] not in ws_manager._rooms


def test_websocket_broadcasts_to_every_socket_in_the_room(auth_client):
    client, headers = auth_client
    _, tc, run = _make_run(client, headers)
    with client.websocket_connect(_ws_url(run["id"], headers)) as ws1, \
            client.websocket_connect(_ws_url(run["id"], headers)) as ws2:
        client.put(f"/api/runs/{run['id']}/results/{tc['id']}", json={"status": "fail"}, headers=headers)
        for ws in (ws1, ws2):
            msg = ws.receive_json()
            assert msg["type"] == "result_updated"
            assert msg["status"] == "fail"
