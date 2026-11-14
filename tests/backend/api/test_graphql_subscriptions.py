"""GraphQL `runUpdates` subscription over graphql-transport-ws on /graphql.

Speaks the wire protocol directly (connection_init -> connection_ack ->
subscribe -> next... -> complete) rather than through a client library, so
the tests pin the protocol itself: what a browser or a Playwright/Java test
will see on the socket.
"""
import time

import pytest
from starlette.websockets import WebSocketDisconnect

from tests.api.test_graphql import CREATE_RUN, UPDATE_RESULT, gql, seed

PROTOCOL = "graphql-transport-ws"
SUBSCRIPTION = """
subscription($id: ID!) { runUpdates(runId: $id) { type runId testCaseId status notes updatedBy runCompleted } }
"""


def _token(headers):
    return headers["Authorization"].removeprefix("Bearer ")


def _setup_run(client, headers):
    [(_, [(sid, [tc1, tc2])])] = seed(client, headers)
    run_id = gql(client, CREATE_RUN, {"sid": sid}, headers)["data"]["createRun"]["id"]
    return run_id, tc1, tc2


def _open(client, connection_params):
    ws = client.websocket_connect("/graphql", subprotocols=[PROTOCOL])
    socket = ws.__enter__()
    socket.send_json({"type": "connection_init", "payload": connection_params})
    assert socket.receive_json() == {"type": "connection_ack"}
    return ws, socket


def _eventually(predicate, timeout=3.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return predicate()


def _error_codes(msg):
    """Execution errors arrive as `next` with `errors` (the resolver is an
    async generator, so it raises on first iteration); pre-execution ones as
    `error`. Clients must handle both, so the tests accept both."""
    if msg["type"] == "error":
        errors = msg["payload"]
    else:
        assert msg["type"] == "next", msg
        errors = msg["payload"]["errors"]
    return [e["extensions"]["code"] for e in errors]


def _subscribe(socket, run_id, op_id="1"):
    socket.send_json({"id": op_id, "type": "subscribe", "payload": {"query": SUBSCRIPTION, "variables": {"id": run_id}}})


@pytest.mark.parametrize("params_for", [
    lambda token: {"authToken": token},
    lambda token: {"Authorization": f"Bearer {token}"},
])
def test_streams_result_updates_from_rest_and_graphql_writes(auth_client, params_for):
    client, headers = auth_client
    run_id, tc1, tc2 = _setup_run(client, headers)
    ws, socket = _open(client, params_for(_token(headers)))
    try:
        _subscribe(socket, run_id)
        # A REST write...
        client.put(f"/api/runs/{run_id}/results/{tc1}", json={"status": "fail", "notes": "rest"}, headers=headers)
        first = socket.receive_json()
        # ...and a GraphQL write reach the same stream.
        gql(client, UPDATE_RESULT, {"rid": run_id, "tid": tc2, "status": "PASS"}, headers)
        second = socket.receive_json()
    finally:
        ws.__exit__(None, None, None)

    assert first == {"id": "1", "type": "next", "payload": {"data": {"runUpdates": {
        "type": "result_updated", "runId": run_id, "testCaseId": tc1, "status": "fail",
        "notes": "rest", "updatedBy": "testuser", "runCompleted": False}}}}
    assert second["payload"]["data"]["runUpdates"]["testCaseId"] == tc2
    assert second["payload"]["data"]["runUpdates"]["runCompleted"] is True


@pytest.mark.parametrize("params", [{}, {"authToken": "nope"}, {"Authorization": "Basic x"}, {"authToken": 123}])
def test_requires_a_valid_token_in_connection_params(auth_client, params):
    client, headers = auth_client
    run_id, _, _ = _setup_run(client, headers)
    ws, socket = _open(client, params)
    try:
        _subscribe(socket, run_id)
        msg = socket.receive_json()
    finally:
        ws.__exit__(None, None, None)
    assert _error_codes(msg) == ["UNAUTHENTICATED"]


@pytest.mark.parametrize("run_id, code", [("99999", "NOT_FOUND"), ("abc", "BAD_REQUEST")])
def test_unknown_or_invalid_run(auth_client, run_id, code):
    client, headers = auth_client
    ws, socket = _open(client, {"authToken": _token(headers)})
    try:
        _subscribe(socket, run_id)
        msg = socket.receive_json()
    finally:
        ws.__exit__(None, None, None)
    assert _error_codes(msg) == [code]


def test_only_the_subscribed_runs_events_arrive(auth_client):
    client, headers = auth_client
    run_a, tc1, _ = _setup_run(client, headers)
    run_b, tc_b, _ = _setup_run(client, headers)
    ws, socket = _open(client, {"authToken": _token(headers)})
    try:
        _subscribe(socket, run_b)
        client.put(f"/api/runs/{run_a}/results/{tc1}", json={"status": "fail"}, headers=headers)
        client.put(f"/api/runs/{run_b}/results/{tc_b}", json={"status": "skip"}, headers=headers)
        # The first event on the stream is run B's, not run A's.
        event = socket.receive_json()["payload"]["data"]["runUpdates"]
    finally:
        ws.__exit__(None, None, None)
    assert event["runId"] == run_b
    assert event["status"] == "skip"


def test_complete_unsubscribes_and_releases_the_listener(auth_client):
    from api.main import ws_manager

    client, headers = auth_client
    run_id, tc1, _ = _setup_run(client, headers)
    ws, socket = _open(client, {"authToken": _token(headers)})
    try:
        _subscribe(socket, run_id)
        client.put(f"/api/runs/{run_id}/results/{tc1}", json={"status": "pass"}, headers=headers)
        socket.receive_json()  # subscription is live
        assert int(run_id) in ws_manager._listeners
        socket.send_json({"id": "1", "type": "complete"})
        # Cancellation of the subscription's generator is asynchronous.
        assert _eventually(lambda: int(run_id) not in ws_manager._listeners)
    finally:
        ws.__exit__(None, None, None)


def test_disconnect_releases_the_listener(auth_client):
    from api.main import ws_manager

    client, headers = auth_client
    run_id, tc1, _ = _setup_run(client, headers)
    ws, socket = _open(client, {"authToken": _token(headers)})
    _subscribe(socket, run_id)
    client.put(f"/api/runs/{run_id}/results/{tc1}", json={"status": "pass"}, headers=headers)
    socket.receive_json()
    ws.__exit__(None, None, None)
    assert _eventually(lambda: int(run_id) not in ws_manager._listeners)


def test_two_subscriptions_on_one_connection(auth_client):
    client, headers = auth_client
    run_id, tc1, _ = _setup_run(client, headers)
    ws, socket = _open(client, {"authToken": _token(headers)})
    try:
        _subscribe(socket, run_id, op_id="a")
        _subscribe(socket, run_id, op_id="b")
        client.put(f"/api/runs/{run_id}/results/{tc1}", json={"status": "pass"}, headers=headers)
        ids = {socket.receive_json()["id"], socket.receive_json()["id"]}
    finally:
        ws.__exit__(None, None, None)
    assert ids == {"a", "b"}


def test_legacy_graphql_ws_protocol_is_not_offered(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/graphql", subprotocols=["graphql-ws"]) as ws:
            ws.receive_json()


def test_run_event_from_results_populated_payload():
    """services/worker's `results_populated` event carries no test case."""
    from api.gql.graph import RunEvent

    event = RunEvent.from_payload(7, {"type": "results_populated", "run_id": 7})
    assert (event.type, event.run_id, event.test_case_id, event.status) == ("results_populated", "7", None, None)
