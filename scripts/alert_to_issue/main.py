"""
Agent Workflow Milestone 5 (issue #189) — alert-to-issue Cloud Function.

Cloud Monitoring's Pub/Sub notification channel (terraform/modules/monitoring)
publishes one message per incident state change (open/closed) to the
`alerts` topic this function is triggered from. Opens a GitHub issue when
an incident opens, and comments + closes it when the same incident closes
— deduped by incident_id (embedded as an HTML comment in the issue body)
so a flapping alert doesn't spam new issues or double-close one.

Deploy target: Cloud Functions (2nd gen), Python 3.11, entry point
`alert_to_issue` — see terraform/modules/monitoring/main.tf. GITHUB_TOKEN
is sourced from Secret Manager (google_secret_manager_secret.github_token),
never a plain env var in the Terraform config itself.

Payload shape: https://cloud.google.com/monitoring/support/notification-options#pubsub

`functions-framework` (this directory's own requirements.txt) pins a
`starlette` version that conflicts with this repo's own `fastapi`/
`starlette` pins — Cloud Functions builds this directory in its own
isolated container from its own requirements.txt, so that never collides
in practice, but it does mean the import below has to stay optional: the
main repo's test environment (and `pip install -r requirements-test.txt`)
never installs functions-framework, only this function's own deploy
environment does.
"""
import base64
import json
import os

import httpx

try:
    import functions_framework
except ImportError:  # not installed in the main repo's test environment — see above
    functions_framework = None

ISSUE_LABEL = "gcp-alert"


def parse_incident(pubsub_message_data: str) -> dict:
    """Decode Cloud Monitoring's base64 Pub/Sub payload into its incident dict."""
    decoded = base64.b64decode(pubsub_message_data).decode("utf-8")
    payload = json.loads(decoded)
    return payload["incident"]


def build_issue_title(incident: dict) -> str:
    return f"[GCP Alert] {incident.get('policy_name', 'Unknown policy')}"


def build_issue_body(incident: dict) -> str:
    lines = [
        f"**Condition:** {incident.get('condition_name', 'unknown')}",
        f"**State:** {incident.get('state', 'unknown')}",
        f"**Summary:** {incident.get('summary', '(no summary)')}",
        f"**Started:** {incident.get('started_at', 'unknown')}",
    ]
    if incident.get("url"):
        lines.append(f"**Details:** {incident['url']}")
    lines.append("")
    lines.append(f"<!-- alert-to-issue incident_id={incident.get('incident_id', '')} -->")
    return "\n".join(lines)


def _api_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def find_existing_issue(client: httpx.Client, repo: str, token: str, incident_id: str) -> dict | None:
    query = f'repo:{repo} type:issue label:"{ISSUE_LABEL}" in:body "incident_id={incident_id}"'
    response = client.get(
        "https://api.github.com/search/issues",
        params={"q": query},
        headers=_api_headers(token),
    )
    response.raise_for_status()
    items = response.json().get("items", [])
    return items[0] if items else None


def handle_incident(client: httpx.Client, repo: str, token: str, incident: dict) -> str:
    """Open a new issue for a newly-opened incident, or comment + close the
    matching issue once Cloud Monitoring reports it closed. Returns the
    issue's html_url, or "" when there's nothing to do."""
    incident_id = incident.get("incident_id", "")
    existing = find_existing_issue(client, repo, token, incident_id)
    headers = _api_headers(token)

    if incident.get("state") == "closed":
        if existing is None:
            # Nothing to close (e.g. the opening notification was lost) — not an error.
            return ""
        client.post(
            f"https://api.github.com/repos/{repo}/issues/{existing['number']}/comments",
            json={"body": "✅ Incident resolved (Cloud Monitoring reports this alert closed)."},
            headers=headers,
        ).raise_for_status()
        client.patch(
            f"https://api.github.com/repos/{repo}/issues/{existing['number']}",
            json={"state": "closed", "state_reason": "completed"},
            headers=headers,
        ).raise_for_status()
        return existing["html_url"]

    if existing is not None:
        # Cloud Monitoring can re-send the same "open" notification — don't duplicate.
        return existing["html_url"]

    response = client.post(
        f"https://api.github.com/repos/{repo}/issues",
        json={"title": build_issue_title(incident), "body": build_issue_body(incident), "labels": [ISSUE_LABEL]},
        headers=headers,
    )
    response.raise_for_status()
    return response.json()["html_url"]


def _alert_to_issue(cloud_event):
    incident = parse_incident(cloud_event.data["message"]["data"])

    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GITHUB_TOKEN"]

    with httpx.Client(timeout=15) as client:
        issue_url = handle_incident(client, repo, token, incident)
    print(f"Handled incident {incident.get('incident_id')}: {issue_url or '(no-op)'}")


if functions_framework is not None:
    # Registered as the Cloud Function entry point (see terraform/modules/
    # monitoring/main.tf's google_cloudfunctions2_function.entry_point) only
    # when functions-framework is actually installed — i.e. never in this
    # repo's own test environment. _alert_to_issue above is what's tested.
    alert_to_issue = functions_framework.cloud_event(_alert_to_issue)
