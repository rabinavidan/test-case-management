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
