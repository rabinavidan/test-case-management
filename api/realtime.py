"""WebSocket rooms per test run; REST and GraphQL writes broadcast through it."""
import asyncio
import json
import logging
from typing import Dict, Set

from fastapi import WebSocket

logger = logging.getLogger("testflow")


# ─── WebSocket connection manager ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        # run_id -> set of connected WebSockets
        self._rooms: Dict[int, Set[WebSocket]] = {}
        # run_id -> in-process listeners (GraphQL `runUpdates` subscriptions)
        self._listeners: Dict[int, Set[asyncio.Queue]] = {}

    def listen(self, run_id: int) -> "asyncio.Queue":
        """Receive every future broadcast for `run_id` on the returned queue."""
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.setdefault(run_id, set()).add(queue)
        return queue

    def unlisten(self, run_id: int, queue: "asyncio.Queue"):
        listeners = self._listeners.get(run_id, set())
        listeners.discard(queue)
        if not listeners:
            self._listeners.pop(run_id, None)

    def join(self, run_id: int, ws: WebSocket):
        """Add an already-accepted socket to `run_id`'s room."""
        self._rooms.setdefault(run_id, set()).add(ws)
        logger.info(f"WS connected run={run_id} total={len(self._rooms[run_id])}")

    def disconnect(self, run_id: int, ws: WebSocket):
        room = self._rooms.get(run_id, set())
        room.discard(ws)
        if not room:
            self._rooms.pop(run_id, None)

    async def broadcast(self, run_id: int, payload: dict):
        for queue in self._listeners.get(run_id, set()):
            queue.put_nowait(payload)
        room = self._rooms.get(run_id, set())
        dead = set()
        for ws in room:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.add(ws)
        for ws in dead:
            room.discard(ws)


ws_manager = ConnectionManager()
