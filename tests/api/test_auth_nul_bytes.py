"""Credentials containing a NUL byte are a validation error (422), not a 500.

passlib refuses to hash or verify a password with a NUL byte, so before they
were rejected at validation the request crashed with a 500 - which the
OpenAPI contract fuzzer (tests/contract/test_openapi_contract.py) hit now and
then on POST /api/users, the case that looked like a flake.
"""
import pytest

NUL = "\x00"


@pytest.mark.parametrize("field", ["username", "email", "password"])
def test_register_with_a_nul_byte_is_a_422(client, field):
    body = {"username": "nuluser", "email": "nul@example.com", "password": "secret1"}
    body[field] = body[field][:2] + NUL + body[field][2:]
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 422
    assert "NUL" in r.text


def test_admin_creating_a_user_with_a_nul_password_is_a_422(auth_client):
    client, headers = auth_client
    r = client.post("/api/users", headers=headers,
                    json={"username": "exec2", "email": "e2@example.com", "password": "pa" + NUL + "ss1"})
    assert r.status_code == 422


def test_login_with_a_nul_password_is_a_422(auth_client):
    client, _ = auth_client
    r = client.post("/api/auth/login", json={"username": "testuser", "password": "test" + NUL + "pass"})
    assert r.status_code == 422
