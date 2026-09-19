"""Zero-dependency static file server for the serverless mocked E2E specs
(mocked-serverless-*.spec.ts, run via playwright.mocked.config.ts).

Mirrors exactly the two routes api/main.py registers for the frontend
(see its "Static files (must be last)" section) without needing FastAPI,
a database, or `pip install` at all:
  - GET /static/<path>  -> serves static/<path> as-is (this is where
    index.html's <script src="/static/app.js"> resolves to)
  - every other GET      -> serves static/index.html's content (the SPA
    itself does all routing client-side via the URL hash, so any path
    just needs to return the same shell)

Usage: python3 serve-static.py [port]  (default port 8010)
"""
import http.server
import os
import sys

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")


class SPAHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.startswith("/static/"):
            self._serve_file(os.path.join(STATIC_DIR, path[len("/static/") :]))
        else:
            self._serve_file(os.path.join(STATIC_DIR, "index.html"))

    def _serve_file(self, filepath: str) -> None:
        filepath = os.path.normpath(filepath)
        if not filepath.startswith(os.path.normpath(STATIC_DIR)) or not os.path.isfile(filepath):
            self.send_response(404)
            self.end_headers()
            return
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
        }.get(os.path.splitext(filepath)[1], "application/octet-stream")
        with open(filepath, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        pass


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    server = http.server.HTTPServer(("127.0.0.1", port), SPAHandler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
