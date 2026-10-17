"""Which paths the single-page app's index.html fallback may answer.

The SPA routes on the URL hash, so any page path can return index.html - but
an API route that doesn't exist, a missing file, or a platform path must not:
answering those with a 200 HTML page turns a broken asset into a script parse
error ("Unexpected token '<'") and makes a mistyped API URL look like it
worked. Shared by the monolith (api/main.py) and the gateway
(services/gateway/main.py); e2e/serve-static.py mirrors it.
"""

# Prefixes that are never pages. `_vercel/` is served by the Vercel platform
# itself (analytics scripts); anywhere else those requests can only 404.
NON_PAGE_PREFIXES = ("api/", "ws/", "static/", "_vercel/")


def is_page_path(path: str) -> bool:
    """True if `path` (no leading slash) may be answered with the SPA's index.html."""
    path = path.lstrip("/")
    if path == "api" or path.startswith(NON_PAGE_PREFIXES):
        return False
    # A file extension in the last segment ("app.js", "favicon.ico") means a
    # file was asked for, not a page.
    last = path.rsplit("/", 1)[-1]
    return "." not in last
