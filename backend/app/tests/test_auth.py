from fastapi.testclient import TestClient

from app.tests.conftest import auth_headers, register_user


def test_register_and_login_flow(client: TestClient) -> None:
    resp = client.post(
        "/api/auth/register",
        json={
            "email": "new.user@example.com",
            "password": "SuperSecret1!",
            "role": "candidate",
            "full_name": "New User",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["role"] == "candidate"
    assert body["user"]["email"] == "new.user@example.com"

    login = client.post(
        "/api/auth/login",
        json={"email": "new.user@example.com", "password": "SuperSecret1!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/api/auth/me", headers=auth_headers(token))
    assert me.status_code == 200
    assert me.json()["email"] == "new.user@example.com"


def test_register_duplicate_email_rejected(client: TestClient) -> None:
    register_user(
        client, email="dup@example.com", password="Password1!", role="hr", full_name="Dup"
    )
    resp = client.post(
        "/api/auth/register",
        json={
            "email": "dup@example.com",
            "password": "Password1!",
            "role": "candidate",
            "full_name": "Other",
        },
    )
    assert resp.status_code == 409


def test_login_invalid_credentials(client: TestClient) -> None:
    register_user(
        client, email="bad@example.com", password="Password1!", role="hr", full_name="Bad"
    )
    resp = client.post(
        "/api/auth/login", json={"email": "bad@example.com", "password": "Wrong-password"}
    )
    assert resp.status_code == 401


def test_me_requires_token(client: TestClient) -> None:
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_password_min_length(client: TestClient) -> None:
    resp = client.post(
        "/api/auth/register",
        json={
            "email": "short@example.com",
            "password": "tiny",
            "role": "candidate",
            "full_name": "Short",
        },
    )
    assert resp.status_code == 422


def test_hr_self_registration_blocked_by_default(client: TestClient) -> None:
    resp = client.post(
        "/api/auth/register",
        json={
            "email": "would-be-hr@example.com",
            "password": "Password123!",
            "role": "hr",
            "full_name": "Would-be HR",
        },
    )
    # The default config has allow_hr_self_register=False, so this is rejected.
    assert resp.status_code == 403, resp.text
    assert "provisioned" in resp.json()["detail"].lower()
