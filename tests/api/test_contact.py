import api.main as main_module


def test_default_contact_recipient_is_the_site_owner():
    """The recipient baked in at import time when CONTACT_EMAIL_TO isn't set."""
    assert main_module.CONTACT_EMAIL_TO == "rabin.avidan.dev@gmail.com"


def test_submit_contact_saves_and_returns_success(client):
    r = client.post("/api/contact", json={
        "topic": "Bug report",
        "email": "someone@example.com",
        "phone": "+1 555 000 1111",
        "description": "Found a bug in the Environments page.",
    })
    assert r.status_code == 201
    assert r.json() == {"detail": "Message sent"}


def test_submit_contact_does_not_require_auth(client):
    r = client.post("/api/contact", json={
        "topic": "General inquiry", "email": "a@b.com", "phone": "555", "description": "Hi",
    })
    assert r.status_code == 201


def test_submit_contact_rejects_invalid_email(client):
    r = client.post("/api/contact", json={
        "topic": "x", "email": "not-an-email", "phone": "1", "description": "y",
    })
    assert r.status_code == 400


def test_submit_contact_rejects_missing_fields(client):
    r = client.post("/api/contact", json={"topic": "x", "email": "a@b.com"})
    assert r.status_code == 422


def test_submit_contact_rejects_empty_fields(client):
    r = client.post("/api/contact", json={
        "topic": "", "email": "a@b.com", "phone": "1", "description": "y",
    })
    assert r.status_code == 422


def test_submit_contact_rejects_description_over_500_chars(client):
    r = client.post("/api/contact", json={
        "topic": "x", "email": "a@b.com", "phone": "1", "description": "y" * 501,
    })
    assert r.status_code == 422


def test_submit_contact_accepts_description_at_500_chars(client):
    r = client.post("/api/contact", json={
        "topic": "x", "email": "a@b.com", "phone": "1", "description": "y" * 500,
    })
    assert r.status_code == 201


# ─── Email backend wiring — verifies _send_contact_email actually calls the
# right transport with the right recipient, rather than just trusting the
# endpoint's 201 (which succeeds even when no email is sent at all). ────────

class _FakeMessage:
    def __init__(self, topic="Bug", email="reporter@example.com", phone="555", description="It broke"):
        self.topic, self.email, self.phone, self.description = topic, email, phone, description


class _FakeResendResponse:
    def __init__(self, status_code=200, text=""):
        self.status_code = status_code
        self.text = text


class _FakeSMTP:
    """Records every call made through it; usable as `with smtplib.SMTP(...) as server`."""
    instances = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port
        self.started_tls = False
        self.login_args = None
        self.sent_message = None
        _FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, user, password):
        self.login_args = (user, password)

    def send_message(self, msg):
        self.sent_message = msg


def test_send_contact_email_uses_resend_when_api_key_set(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.delenv("SMTP_HOST", raising=False)

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _FakeResendResponse(status_code=200)

    monkeypatch.setattr("httpx.post", fake_post)

    ok = main_module._send_contact_email(_FakeMessage(topic="Login broken", email="reporter@example.com"))

    assert ok is True
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    assert captured["json"]["to"] == [main_module.CONTACT_EMAIL_TO]
    assert captured["json"]["reply_to"] == "reporter@example.com"
    assert "Login broken" in captured["json"]["subject"]


def test_send_contact_email_returns_false_on_resend_error_status(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr("httpx.post", lambda *a, **k: _FakeResendResponse(status_code=422, text="bad request"))

    assert main_module._send_contact_email(_FakeMessage()) is False


def test_send_contact_email_falls_back_to_smtp_when_no_resend_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USERNAME", "bot@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "hunter2")
    _FakeSMTP.instances = []
    monkeypatch.setattr("smtplib.SMTP", _FakeSMTP)

    ok = main_module._send_contact_email(_FakeMessage(topic="Feature request", email="reporter@example.com"))

    assert ok is True
    assert len(_FakeSMTP.instances) == 1
    server = _FakeSMTP.instances[0]
    assert server.host == "smtp.example.com"
    assert server.started_tls is True
    assert server.login_args == ("bot@example.com", "hunter2")
    assert server.sent_message["To"] == main_module.CONTACT_EMAIL_TO
    assert server.sent_message["Reply-To"] == "reporter@example.com"
    assert "Feature request" in server.sent_message["Subject"]


def test_send_contact_email_prefers_resend_over_smtp_when_both_configured(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    _FakeSMTP.instances = []
    monkeypatch.setattr("httpx.post", lambda *a, **k: _FakeResendResponse(status_code=200))
    monkeypatch.setattr("smtplib.SMTP", _FakeSMTP)

    main_module._send_contact_email(_FakeMessage())

    assert _FakeSMTP.instances == []  # SMTP never touched


def test_send_contact_email_returns_false_with_no_backend_configured(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)

    assert main_module._send_contact_email(_FakeMessage()) is False


def test_send_contact_email_survives_a_transport_exception(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")

    def raise_error(*a, **k):
        raise ConnectionError("network unreachable")

    monkeypatch.setattr("httpx.post", raise_error)

    assert main_module._send_contact_email(_FakeMessage()) is False


def test_post_contact_endpoint_calls_the_email_backend(client, monkeypatch):
    """End-to-end through the real HTTP endpoint, not just the helper directly."""
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    calls = []
    monkeypatch.setattr("httpx.post", lambda *a, **k: calls.append(k.get("json") or a) or _FakeResendResponse(200))

    r = client.post("/api/contact", json={
        "topic": "Payment issue", "email": "customer@example.com", "phone": "555-0100",
        "description": "Card declined at checkout",
    })

    assert r.status_code == 201
    assert len(calls) == 1
    sent = calls[0]
    assert sent["to"] == [main_module.CONTACT_EMAIL_TO]
    assert sent["reply_to"] == "customer@example.com"
    assert "Payment issue" in sent["subject"]
