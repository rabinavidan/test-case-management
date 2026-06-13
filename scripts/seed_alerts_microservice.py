"""
Seed script: creates test suites + cases for the Alerts Microservice project.
Usage:
    POSTGRES_URL=<your-neon-url> python scripts/seed_alerts_microservice.py
Or run from the project root after setting the env var in your shell.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api.database import SessionLocal
from api import models

PROJECT_ID = 8  # Alerts Microservice

SUITES = [
    {
        "name": "Data Ingestion",
        "description": "Kafka and GCP Pub/Sub message ingestion",
        "cases": [
            ("Kafka topic receives alert event", "active", "high"),
            ("GCP Pub/Sub message published successfully", "active", "high"),
            ("Malformed message is rejected with error", "active", "medium"),
            ("Message retry on transient failure", "active", "medium"),
            ("Dead-letter queue captures failed messages", "active", "low"),
        ],
    },
    {
        "name": "Alerts Logic Engine",
        "description": "Core alert evaluation and rule matching",
        "cases": [
            ("Alert triggers when threshold exceeded", "active", "high"),
            ("No alert when value is within threshold", "active", "high"),
            ("Multi-condition rule evaluates correctly", "active", "high"),
            ("Alert deduplication prevents duplicate notifications", "active", "medium"),
            ("Alert severity mapped correctly (low/med/high)", "active", "medium"),
            ("Stale alert expires after TTL", "active", "low"),
        ],
    },
    {
        "name": "Rule Validator",
        "description": "Alert rule syntax and validation",
        "cases": [
            ("Valid rule passes validation", "active", "high"),
            ("Missing required field returns 400", "active", "high"),
            ("Invalid operator type rejected", "active", "medium"),
            ("Threshold out of range rejected", "active", "medium"),
            ("Rule with valid schedule accepted", "active", "low"),
        ],
    },
    {
        "name": "Scheduler Service",
        "description": "Scheduled alert job execution",
        "cases": [
            ("Scheduled job fires at correct interval", "active", "high"),
            ("Job does not fire when disabled", "active", "high"),
            ("Missed job recovers on restart", "active", "medium"),
            ("Concurrent jobs do not duplicate alerts", "active", "medium"),
            ("Job logs execution timestamp", "active", "low"),
        ],
    },
    {
        "name": "Notification Engine",
        "description": "Notification dispatch orchestration",
        "cases": [
            ("Notification routed to correct channel", "active", "high"),
            ("UI-only alert does not trigger email", "active", "high"),
            ("Daily digest batches alerts correctly", "active", "medium"),
            ("Weekly digest contains correct date range", "active", "medium"),
            ("Failed notification retried up to 3 times", "active", "medium"),
        ],
    },
    {
        "name": "Email Engine",
        "description": "Email delivery via SMTP/SendGrid",
        "cases": [
            ("Alert email sent with correct subject", "active", "high"),
            ("Email contains alert details and timestamp", "active", "high"),
            ("Unsubscribed user does not receive email", "active", "high"),
            ("Bounce handling marks address as invalid", "active", "medium"),
            ("SendGrid API failure falls back to SMTP", "active", "low"),
        ],
    },
    {
        "name": "Data Persistence",
        "description": "MongoDB, Elasticsearch, Solr, Redis, BigQuery storage",
        "cases": [
            ("User preferences saved to MongoDB", "active", "high"),
            ("Alert indexed in Elasticsearch", "active", "high"),
            ("Funding data queryable via Solr", "active", "medium"),
            ("Historical data retrievable from BigQuery", "active", "medium"),
            ("Cache hit served from Redis", "active", "high"),
            ("Redis cache invalidated on data update", "active", "medium"),
            ("Elasticsearch query returns ranked results", "active", "low"),
        ],
    },
    {
        "name": "Notification Center UI",
        "description": "Client-side notification center",
        "cases": [
            ("Notification center shows unread count", "active", "high"),
            ("Clicking notification marks it as read", "active", "high"),
            ("Real-time update appears without page reload", "active", "medium"),
            ("Empty state shown when no notifications", "active", "low"),
            ("Notification links to correct resource", "active", "medium"),
        ],
    },
]


def main():
    db = SessionLocal()
    try:
        project = db.query(models.Project).filter(models.Project.id == PROJECT_ID).first()
        if not project:
            print(f"Project {PROJECT_ID} not found. Check the ID.")
            return

        print(f"Seeding project: {project.name}")
        total_cases = 0

        for suite_data in SUITES:
            suite = models.TestSuite(
                project_id=PROJECT_ID,
                name=suite_data["name"],
                description=suite_data["description"],
            )
            db.add(suite)
            db.flush()

            for title, status, priority in suite_data["cases"]:
                tc = models.TestCase(
                    suite_id=suite.id,
                    title=title,
                    status=status,
                    priority=priority,
                )
                db.add(tc)
                total_cases += 1

            print(f"  ✓ {suite_data['name']} ({len(suite_data['cases'])} cases)")

        db.commit()
        print(f"\nDone — {len(SUITES)} suites, {total_cases} test cases created.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
