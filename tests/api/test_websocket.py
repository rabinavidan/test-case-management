def test_websocket_ping_pong(client):
    with client.websocket_connect("/ws/runs/1") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_websocket_broadcasts_result_update(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "WS Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "WS Suite"}, headers=headers).json()
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC", "status": "active"}, headers=headers).json()
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "WS Run"}, headers=headers).json()

    with client.websocket_connect(f"/ws/runs/{run['id']}") as ws:
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

    with client.websocket_connect(f"/ws/runs/{run_b['id']}") as ws_b:
        client.put(
            f"/api/runs/{run_a['id']}/results/{tc['id']}",
            json={"status": "fail"},
            headers=headers,
        )
        # The other run's room shouldn't receive this broadcast; confirm the
        # connection is still alive by using the ping/pong keep-alive path.
        ws_b.send_text("ping")
        assert ws_b.receive_text() == "pong"
