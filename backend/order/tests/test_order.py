# backend/order/tests/test_order.py
"""
Tests for POST /api/order — Member 3.
Validates every branch in the order placement route against contracts/order.yaml.
"""

import os
import sys
import uuid
import sqlite3
import datetime
import jwt
import pytest

# ---------------------------------------------------------------------------
# Ensure the backend package is importable regardless of working directory
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SESSION_ID = "test-session-abc"
TEST_SECRET = "dev-super-secret-jwt-key-2026"  # matches config.py default


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jwt(customer_public_id):
    """Generate a valid JWT token matching the auth module's format."""
    payload = {
        "customer_id": customer_public_id,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def _seed_cart(db_path, item_id, quantity=2, session_id=SESSION_ID):
    """Insert a cart row directly into the test DB."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT OR REPLACE INTO cart_items (session_id, item_public_id, quantity) VALUES (?, ?, ?)",
        (session_id, item_id, quantity),
    )
    conn.commit()
    conn.close()


def _post_order(client, customer_name="Ahmed Hassan", session_id=SESSION_ID, token=None):
    """POST /api/order with session cookie and JWT auth header."""
    client.set_cookie("session_id", session_id, domain="localhost")
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.post(
        "/api/order",
        json={"customer_name": customer_name},
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def client(tmp_path):
    """
    Create a disposable SQLite DB (inside tmp_path),
    apply schema.sql, seed test data, and yield a Flask test client.
    """
    db_path = str(tmp_path / "test.db")
    schema_path = os.path.join(BACKEND_DIR, "schema.sql")

    # Build DB from schema
    conn = sqlite3.connect(db_path)
    with open(schema_path, "r") as f:
        conn.executescript(f.read())
    conn.commit()

    # Seed a customer (required for FK on orders.customer_public_id)
    customer_public_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO customers (customer_public_id, email, username, password_hash, full_name) "
        "VALUES (?, ?, ?, ?, ?)",
        (customer_public_id, "test@desofa.com", "testuser", generate_password_hash("Test1234"), "Test User"),
    )

    # Seed two menu items — one available, one unavailable
    item_available_id = str(uuid.uuid4())
    item_unavailable_id = str(uuid.uuid4())

    conn.execute(
        "INSERT INTO items (public_id, name, description, price, category, available) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (item_available_id, "Latte", "Creamy latte", 45.00, "coffee", 1),
    )
    conn.execute(
        "INSERT INTO items (public_id, name, description, price, category, available) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (item_unavailable_id, "Mocha", "Chocolate mocha", 55.00, "coffee", 0),
    )
    conn.commit()
    conn.close()

    # Patch get_db in the order blueprint to use our test DB
    import order.routes as order_routes
    original_get_db = order_routes.get_db

    def _test_get_db():
        from flask import g
        if "db" not in g:
            g.db = sqlite3.connect(db_path)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    order_routes.get_db = _test_get_db

    app.config["TESTING"] = True

    # Generate a valid JWT for the seeded customer
    token = _make_jwt(customer_public_id)

    with app.test_client() as c:
        c.item_available_id = item_available_id
        c.item_unavailable_id = item_unavailable_id
        c.customer_public_id = customer_public_id
        c.token = token
        c.db_path = db_path
        yield c

    # Restore original
    order_routes.get_db = original_get_db


# ---------------------------------------------------------------------------
# 1. Happy path — 201 Created
# ---------------------------------------------------------------------------

class TestPlaceOrderSuccess:
    def test_201_returns_correct_schema(self, client):
        _seed_cart(client.db_path, client.item_available_id, quantity=3)
        resp = _post_order(client, token=client.token)

        assert resp.status_code == 201
        data = resp.get_json()

        # Contract: PlaceOrderResponse has exactly order_id, status, total
        assert set(data.keys()) == {"order_id", "status", "total"}
        assert data["status"] == "pending"
        assert data["total"] == 135.00  # 45.00 * 3
        # order_id must be a valid UUID
        uuid.UUID(data["order_id"])  # raises if invalid

    def test_cart_is_cleared_after_order(self, client):
        _seed_cart(client.db_path, client.item_available_id, quantity=1)
        _post_order(client, token=client.token)

        conn = sqlite3.connect(client.db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM cart_items WHERE session_id = ?",
            (SESSION_ID,),
        ).fetchone()[0]
        conn.close()
        assert count == 0

    def test_order_items_snapshot_price(self, client):
        _seed_cart(client.db_path, client.item_available_id, quantity=2)
        resp = _post_order(client, token=client.token)
        order_id = resp.get_json()["order_id"]

        conn = sqlite3.connect(client.db_path)
        rows = conn.execute(
            "SELECT unit_price, quantity FROM order_items WHERE order_public_id = ?",
            (order_id,),
        ).fetchall()
        conn.close()

        assert len(rows) == 1
        assert rows[0][0] == 45.00  # price locked at placement time
        assert rows[0][1] == 2


# ---------------------------------------------------------------------------
# 2. Empty cart — 400 EMPTY_CART
# ---------------------------------------------------------------------------

class TestEmptyCart:
    def test_400_when_cart_is_empty(self, client):
        resp = _post_order(client, token=client.token)
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["code"] == "EMPTY_CART"

    def test_400_when_no_session_cookie(self, client):
        resp = client.post(
            "/api/order",
            json={"customer_name": "Ahmed"},
            headers={"Authorization": f"Bearer {client.token}"},
        )
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["code"] == "EMPTY_CART"


# ---------------------------------------------------------------------------
# 3. Invalid customer name — 422 INVALID_INPUT
# ---------------------------------------------------------------------------

class TestInvalidInput:
    @pytest.mark.parametrize("bad_name", [
        "",                          # empty
        "A" * 61,                    # too long
        "Ahmed<script>",             # XSS attempt
        "Omar@#$",                   # special chars
    ])
    def test_422_invalid_customer_name(self, client, bad_name):
        _seed_cart(client.db_path, client.item_available_id)
        resp = _post_order(client, customer_name=bad_name, token=client.token)
        assert resp.status_code == 422
        data = resp.get_json()
        assert data["code"] == "INVALID_INPUT"

    def test_422_when_no_json_body(self, client):
        client.set_cookie("session_id", SESSION_ID, domain="localhost")
        resp = client.post(
            "/api/order",
            data="not json",
            content_type="text/plain",
            headers={"Authorization": f"Bearer {client.token}"},
        )
        assert resp.status_code == 422
        data = resp.get_json()
        assert data["code"] == "INVALID_INPUT"

    def test_422_when_customer_name_missing(self, client):
        client.set_cookie("session_id", SESSION_ID, domain="localhost")
        resp = client.post(
            "/api/order",
            json={},
            headers={"Authorization": f"Bearer {client.token}"},
        )
        assert resp.status_code == 422
        data = resp.get_json()
        assert data["code"] == "INVALID_INPUT"


# ---------------------------------------------------------------------------
# 4. Unavailable item — 409 ITEM_UNAVAILABLE
# ---------------------------------------------------------------------------

class TestItemUnavailable:
    def test_409_when_item_unavailable(self, client):
        _seed_cart(client.db_path, client.item_unavailable_id, quantity=1)
        resp = _post_order(client, token=client.token)
        assert resp.status_code == 409
        data = resp.get_json()
        assert data["code"] == "ITEM_UNAVAILABLE"

    def test_409_when_mixed_available_and_unavailable(self, client):
        _seed_cart(client.db_path, client.item_available_id, quantity=1)
        _seed_cart(client.db_path, client.item_unavailable_id, quantity=1)
        resp = _post_order(client, token=client.token)
        assert resp.status_code == 409
        data = resp.get_json()
        assert data["code"] == "ITEM_UNAVAILABLE"


# ---------------------------------------------------------------------------
# 5. Idempotency — 200 on duplicate POST within 5 s (EC-01)
# ---------------------------------------------------------------------------

class TestIdempotency:
    def test_200_duplicate_post_returns_same_order(self, client):
        _seed_cart(client.db_path, client.item_available_id, quantity=2)

        resp1 = _post_order(client, token=client.token)
        assert resp1.status_code == 201
        order_id_1 = resp1.get_json()["order_id"]

        # Immediately POST again (within 5 s window)
        resp2 = _post_order(client, token=client.token)
        assert resp2.status_code == 200
        data2 = resp2.get_json()

        # Must return exact same schema and same order_id
        assert set(data2.keys()) == {"order_id", "status", "total"}
        assert data2["order_id"] == order_id_1
        assert data2["status"] == "pending"
        assert data2["total"] == 90.00  # 45 * 2


# ---------------------------------------------------------------------------
# 6. Auth — 401 on missing/invalid token
# ---------------------------------------------------------------------------

class TestAuthRequired:
    def test_401_when_no_auth_header(self, client):
        _seed_cart(client.db_path, client.item_available_id)
        resp = _post_order(client, token=None)  # no token
        assert resp.status_code == 401

    def test_401_when_invalid_token(self, client):
        _seed_cart(client.db_path, client.item_available_id)
        resp = _post_order(client, token="invalid.token.here")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 7. Error response shape — every error has { error, code }
# ---------------------------------------------------------------------------

class TestErrorSchema:
    def test_all_error_responses_have_correct_shape(self, client):
        # 400 — empty cart
        resp = _post_order(client, token=client.token)
        data = resp.get_json()
        assert "error" in data and "code" in data

        # 422 — invalid name
        _seed_cart(client.db_path, client.item_available_id)
        resp = _post_order(client, customer_name="<script>alert(1)</script>", token=client.token)
        data = resp.get_json()
        assert "error" in data and "code" in data

        # 409 — unavailable item
        _seed_cart(client.db_path, client.item_unavailable_id)
        resp = _post_order(client, token=client.token)
        data = resp.get_json()
        assert "error" in data and "code" in data

        # 401 — no auth
        resp = _post_order(client, token=None)
        data = resp.get_json()
        assert "error" in data and "code" in data
