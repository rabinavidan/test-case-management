"""Heartbeat-file liveness for processes with no HTTP surface (services/worker).

The consume loop touches the file on every iteration; the Kubernetes exec
probe runs `python -m services.common.heartbeat <path> <max_age_seconds>`,
which exits non-zero once the file goes stale. Without it, a loop that
wedges without crashing would never be restarted — the container's exit
code only catches a crash. Stdlib-only on purpose, so the probe works in
the worker image (no FastAPI there) and starts fast.
"""
import pathlib
import sys
import time

DEFAULT_PATH = "/tmp/worker-heartbeat"


def touch_heartbeat(path: str = DEFAULT_PATH) -> None:
    try:
        pathlib.Path(path).touch()
    except OSError:
        # A heartbeat we can't write fails the probe on its own — never let
        # it take the consume loop down with it.
        pass


def heartbeat_is_fresh(path: str, max_age_seconds: float) -> bool:
    try:
        return time.time() - pathlib.Path(path).stat().st_mtime <= max_age_seconds
    except OSError:
        return False


def main(argv: list[str]) -> int:
    return 0 if heartbeat_is_fresh(argv[0], float(argv[1])) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
