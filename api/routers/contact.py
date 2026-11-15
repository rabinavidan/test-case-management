"""Contact form: stores the message and emails it (Resend, falling back to SMTP)."""
import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

logger = logging.getLogger("testflow")
router = APIRouter()


# ─── Contact Us ────────────────────────────────────────────────────────────
# Public, unauthenticated — anyone browsing the landing page can reach out.
# Every submission is saved first (source of truth), then a best-effort
# notification email is attempted. Two backends are supported:
#   - RESEND_API_KEY: an HTTP API call (works from serverless platforms like
#     Vercel, which commonly block outbound SMTP ports).
#   - SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD: plain SMTP, for self-hosted
#     deployments (Docker Compose) where outbound SMTP isn't blocked.
# Neither configured -> the message is still saved; only the email is skipped.
CONTACT_EMAIL_TO = os.getenv("CONTACT_EMAIL_TO", "rabin.avidan.dev@gmail.com")


def _send_contact_email(msg: models.ContactMessage) -> bool:
    subject = f"[TestFlow Contact] {msg.topic}"
    body = f"Topic: {msg.topic}\nFrom: {msg.email}\nPhone: {msg.phone}\n\n{msg.description}\n"

    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key:
        try:
            import httpx
            r = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json={
                    "from": os.getenv("CONTACT_EMAIL_FROM", "TestFlow Contact <onboarding@resend.dev>"),
                    "to": [CONTACT_EMAIL_TO],
                    "reply_to": msg.email,
                    "subject": subject,
                    "text": body,
                },
                timeout=10,
            )
            if r.status_code >= 300:
                logger.warning(f"Resend contact email failed: {r.status_code} {r.text}")
            return r.status_code < 300
        except Exception:
            logger.exception("Failed to send contact email via Resend")
            return False

    smtp_host = os.getenv("SMTP_HOST")
    if smtp_host:
        try:
            import smtplib
            from email.message import EmailMessage
            email_msg = EmailMessage()
            email_msg["Subject"] = subject
            email_msg["From"] = os.getenv("SMTP_USERNAME", CONTACT_EMAIL_TO)
            email_msg["To"] = CONTACT_EMAIL_TO
            email_msg["Reply-To"] = msg.email
            email_msg.set_content(body)
            with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=10) as server:
                if os.getenv("SMTP_USE_TLS", "true").lower() != "false":
                    server.starttls()
                smtp_user = os.getenv("SMTP_USERNAME")
                if smtp_user:
                    server.login(smtp_user, os.getenv("SMTP_PASSWORD", ""))
                server.send_message(email_msg)
            return True
        except Exception:
            logger.exception("Failed to send contact email via SMTP")
            return False

    logger.warning("Contact message saved but no email backend configured (RESEND_API_KEY or SMTP_HOST)")
    return False


@router.post("/api/contact", status_code=201)
def submit_contact(body: schemas.ContactCreate, db: Session = Depends(get_db)):
    if "@" not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    msg = models.ContactMessage(
        topic=body.topic.strip(),
        email=body.email.strip(),
        phone=body.phone.strip(),
        description=body.description.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    _send_contact_email(msg)
    return {"detail": "Message sent"}
