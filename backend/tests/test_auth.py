def test_first_run_setup_and_login(client):
    assert client.get("/auth/status").json() == {"setup_required": True, "user_count": 0}

    setup = client.post("/auth/setup", json={"username": "admin", "password": "maintenance-test-123"})
    assert setup.status_code == 201, setup.text
    payload = setup.json()
    assert payload["user"]["role"] == "admin"
    assert payload["user"]["active"] is True
    assert payload["token"]
    assert client.get("/auth/status").json() == {"setup_required": False, "user_count": 1}

    assert client.post("/auth/setup", json={"username": "other", "password": "maintenance-test-456"}).status_code == 409
    assert client.post("/auth/login", json={"username": "admin", "password": "wrong-password-123"}).status_code == 401

    login = client.post("/auth/login", json={"username": "admin", "password": "maintenance-test-123"})
    assert login.status_code == 200, login.text
    token = login.json()["token"]
    current = client.get("/auth/session", headers={"X-App-Session": token})
    assert current.status_code == 200
    assert current.json()["username"] == "admin"

    logout = client.post("/auth/logout", headers={"X-App-Session": token})
    assert logout.status_code == 200
    assert client.get("/auth/session", headers={"X-App-Session": token}).status_code == 401


def test_admin_can_manage_multiple_users_and_last_admin_is_protected(client):
    setup = client.post("/auth/setup", json={"username": "admin", "password": "maintenance-test-123"}).json()
    token = setup["token"]
    headers = {"X-App-Session": token}

    viewer = client.post("/auth/users", headers=headers, json={
        "username": "viewer", "role": "viewer", "password": "viewer-password-123"
    })
    assert viewer.status_code == 201, viewer.text
    viewer_id = viewer.json()["id"]

    admin2 = client.post("/auth/users", headers=headers, json={
        "username": "admin2", "role": "admin", "password": "second-admin-123"
    })
    assert admin2.status_code == 201, admin2.text

    users = client.get("/auth/users", headers=headers)
    assert users.status_code == 200
    assert {row["username"] for row in users.json()} == {"admin", "admin2", "viewer"}

    viewer_login = client.post("/auth/login", json={"username": "viewer", "password": "viewer-password-123"}).json()
    viewer_headers = {"X-App-Session": viewer_login["token"]}
    assert client.get("/auth/users", headers=viewer_headers).status_code == 403

    changed = client.put(f"/auth/users/{viewer_id}", headers=headers, json={
        "username": "viewer", "role": "viewer", "active": False, "password": ""
    })
    assert changed.status_code == 200
    assert changed.json()["active"] is False

    first_admin_id = setup["user"]["id"]
    assert client.delete(f"/auth/users/{first_admin_id}", headers=headers).status_code == 409

    second_id = admin2.json()["id"]
    assert client.delete(f"/auth/users/{second_id}", headers=headers).status_code == 204

    downgrade = client.put(f"/auth/users/{first_admin_id}", headers=headers, json={
        "username": "admin", "role": "viewer", "active": True, "password": ""
    })
    assert downgrade.status_code == 409


def test_password_change_invalidates_existing_sessions(client):
    setup = client.post("/auth/setup", json={"username": "admin", "password": "maintenance-test-123"}).json()
    admin_headers = {"X-App-Session": setup["token"]}
    viewer = client.post("/auth/users", headers=admin_headers, json={
        "username": "viewer", "role": "viewer", "password": "viewer-password-123"
    }).json()
    old_login = client.post("/auth/login", json={"username": "viewer", "password": "viewer-password-123"}).json()

    updated = client.put(f"/auth/users/{viewer['id']}", headers=admin_headers, json={
        "username": "viewer", "role": "viewer", "active": True, "password": "viewer-password-456"
    })
    assert updated.status_code == 200
    assert client.get("/auth/session", headers={"X-App-Session": old_login["token"]}).status_code == 401
    assert client.post("/auth/login", json={"username": "viewer", "password": "viewer-password-123"}).status_code == 401
    assert client.post("/auth/login", json={"username": "viewer", "password": "viewer-password-456"}).status_code == 200
