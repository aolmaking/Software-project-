"""
backend/cart/tests/test_cart.py
Pytest test suite for the Cart module — SOFA Coffee Shop
"""

import json
import sqlite3
import os
import pytest

# ─── Use an in-memory / temp DB for tests ───────────────────────────
TEST_DB = ":memory:"

# ─── Patch DB path before importing the app ─────────────────────────
os.environ["SOFA_DB_PATH"] = TEST_DB


# ─────────────────────────────────────────
# Minimal Flask app factory for testing
# ─────────────────────────────────────────
def create_test_app():
    from flask import Flask
    from backend.cart.routes import cart_bp

    app = Flask(__name__)
    app.secret_key = "test-secret-key-sofa"
    app.config["TESTING"] = True
    app.config["SESSION_TYPE"] = "filesystem"
    app.register_blueprint(cart_bp)
    return app


# ─────────────────────────────────────────
# DB bootstrap helpers
# ─────────────────────────────────────────
def seed_db(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS items (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            price       REAL NOT NULL,
            description TEXT,
            available   INTEGER NOT NULL DEFAULT 1,
            allergens   TEXT,
            category    TEXT
        )
        """
    )
    conn.executemany(
        "INSERT OR REPLACE INTO items VALUES (?,?,?,?,?,?,?)",
        [
            ("item-001", "Caramel Latte", 4.50, "Rich caramel espresso", 1, "milk", "drinks"),
            ("item-002", "Croissant", 3.00, "Buttery flaky pastry", 1, "gluten,dairy", "bakery"),
            ("item-003", "Sold-Out Muffin", 2.50, "Blueberry muffin", 0, "gluten", "bakery"),
        ],
    )
    conn.commit()


@pytest.fixture(autouse=True)
def patch_get_db(monkeypatch, tmp_path):
    """
    Redirect every get_db() call to a fresh SQLite file per test.
    This keeps tests isolated and in-process.
    """
    db_file = str(tmp_path / "test.db")
    os.environ["SOFA_DB_PATH"] = db_file

    conn = sqlite3.connect(db_file)
    seed_db(conn)
    conn.close()

    import backend.cart.routes as routes_module
    monkeypatch.setattr(routes_module, "DB_PATH", db_file)
    yield
    # cleanup handled by tmp_path


# ─────────────────────────────────────────
# Client fixture
# ─────────────────────────────────────────
@pytest.fixture()
def client():
    app = create_test_app()
    with app.test_client() as client:
        with app.app_context():
            yield client


# ─────────────────────────────────────────
# Helper
# ─────────────────────────────────────────
def add_item(client, item_id="item-001", quantity=1):
    return client.post(
        "/api/cart/",
        data=json.dumps({"item_id": item_id, "quantity": quantity}),
        content_type="application/json",
    )


def get_cart(client):
    return client.get("/api/cart/")


# ═══════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════


class TestGetCart:
    def test_empty_cart_returns_200(self, client):
        rv = get_cart(client)
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["items"] == []
        assert data["subtotal"] == 0.00

    def test_cart_structure(self, client):
        add_item(client)
        rv = get_cart(client)
        data = rv.get_json()
        assert "items" in data
        assert "subtotal" in data


class TestAddToCart:
    def test_add_item_success(self, client):
        rv = add_item(client)
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["quantity"] == 1
        assert data["item_id"] == "item-001"

    def test_add_item_increments_existing(self, client):
        """F-CRT-02: Adding same item again increments quantity."""
        add_item(client, quantity=1)
        add_item(client, quantity=2)
        cart = get_cart(client).get_json()
        item = next(i for i in cart["items"] if i["item_id"] == "item-001")
        assert item["quantity"] == 3

    def test_add_unavailable_item_returns_409(self, client):
        """F-CRT-06: Unavailable item → 409."""
        rv = add_item(client, item_id="item-003")
        assert rv.status_code == 409
        assert "unavailable" in rv.get_json()["error"].lower()

    def test_add_nonexistent_item_returns_404(self, client):
        rv = add_item(client, item_id="item-999")
        assert rv.status_code == 404

    def test_missing_item_id_returns_400(self, client):
        rv = client.post(
            "/api/cart/",
            data=json.dumps({"quantity": 1}),
            content_type="application/json",
        )
        assert rv.status_code == 400

    def test_missing_body_returns_400(self, client):
        rv = client.post("/api/cart/", content_type="application/json")
        assert rv.status_code == 400


class TestQuantityValidation:
    def test_quantity_zero_returns_422(self, client):
        rv = add_item(client, quantity=0)
        assert rv.status_code == 422

    def test_quantity_negative_returns_422(self, client):
        rv = add_item(client, quantity=-5)
        assert rv.status_code == 422

    def test_quantity_over_max_returns_422(self, client):
        rv = add_item(client, quantity=999)
        assert rv.status_code == 422

    def test_quantity_string_returns_422(self, client):
        rv = client.post(
            "/api/cart/",
            data=json.dumps({"item_id": "item-001", "quantity": "five"}),
            content_type="application/json",
        )
        assert rv.status_code == 422

    def test_quantity_float_returns_422(self, client):
        rv = client.post(
            "/api/cart/",
            data=json.dumps({"item_id": "item-001", "quantity": 1.5}),
            content_type="application/json",
        )
        assert rv.status_code == 422

    def test_quantity_bool_returns_422(self, client):
        """bool is a subclass of int in Python — must be rejected."""
        rv = client.post(
            "/api/cart/",
            data=json.dumps({"item_id": "item-001", "quantity": True}),
            content_type="application/json",
        )
        assert rv.status_code == 422

    def test_quantity_max_allowed(self, client):
        rv = add_item(client, quantity=20)
        assert rv.status_code == 200

    def test_quantity_min_allowed(self, client):
        rv = add_item(client, quantity=1)
        assert rv.status_code == 200

    def test_cumulative_exceeds_max_returns_422(self, client):
        add_item(client, quantity=15)
        rv = add_item(client, quantity=10)  # 15 + 10 = 25 > 20
        assert rv.status_code == 422


class TestUpdateCartItem:
    def test_patch_updates_quantity(self, client):
        add_item(client)
        rv = client.patch(
            "/api/cart/item-001",
            data=json.dumps({"quantity": 5}),
            content_type="application/json",
        )
        assert rv.status_code == 200
        assert rv.get_json()["quantity"] == 5

    def test_patch_nonexistent_item_returns_404(self, client):
        rv = client.patch(
            "/api/cart/item-999",
            data=json.dumps({"quantity": 2}),
            content_type="application/json",
        )
        assert rv.status_code == 404

    def test_patch_invalid_quantity_returns_422(self, client):
        add_item(client)
        rv = client.patch(
            "/api/cart/item-001",
            data=json.dumps({"quantity": 0}),
            content_type="application/json",
        )
        assert rv.status_code == 422


class TestRemoveCartItem:
    def test_remove_item(self, client):
        add_item(client)
        rv = client.delete("/api/cart/item-001")
        assert rv.status_code == 200
        cart = get_cart(client).get_json()
        assert all(i["item_id"] != "item-001" for i in cart["items"])

    def test_remove_nonexistent_item_returns_404(self, client):
        rv = client.delete("/api/cart/item-999")
        assert rv.status_code == 404


class TestClearCart:
    def test_clear_cart(self, client):
        add_item(client, "item-001")
        add_item(client, "item-002")
        rv = client.delete("/api/cart/")
        assert rv.status_code == 200
        cart = get_cart(client).get_json()
        assert cart["items"] == []
        assert cart["subtotal"] == 0.00


class TestSubtotal:
    def test_subtotal_correct(self, client):
        """item-001 = 4.50×2=9.00, item-002 = 3.00×1=3.00 → 12.00"""
        add_item(client, "item-001", 2)
        add_item(client, "item-002", 1)
        cart = get_cart(client).get_json()
        assert cart["subtotal"] == 12.00

    def test_subtotal_uses_live_price(self, client, monkeypatch, tmp_path):
        """EC-02: subtotal must reflect latest DB price."""
        import backend.cart.routes as routes_module

        add_item(client, "item-001", 1)

        # Update price in DB directly
        conn = sqlite3.connect(routes_module.DB_PATH)
        conn.execute("UPDATE items SET price = 9.99 WHERE id = 'item-001'")
        conn.commit()
        conn.close()

        cart = get_cart(client).get_json()
        assert cart["subtotal"] == 9.99

    def test_subtotal_two_decimal_places(self, client):
        add_item(client, "item-001", 1)
        cart = get_cart(client).get_json()
        subtotal_str = str(cart["subtotal"])
        if "." in subtotal_str:
            assert len(subtotal_str.split(".")[1]) <= 2


class TestSessionPersistence:
    def test_cart_persists_across_requests(self, client):
        """F-CRT-01: Cart survives multiple requests in same session."""
        add_item(client, "item-001", 1)
        add_item(client, "item-002", 1)
        cart = get_cart(client).get_json()
        assert len(cart["items"]) == 2

    def test_line_total_present(self, client):
        add_item(client, "item-001", 3)
        cart = get_cart(client).get_json()
        item = next(i for i in cart["items"] if i["item_id"] == "item-001")
        assert item["line_total"] == round(4.50 * 3, 2)


class TestResponseFormat:
    def test_all_responses_are_json(self, client):
        rv = get_cart(client)
        assert rv.content_type == "application/json"

    def test_error_response_has_error_key(self, client):
        rv = add_item(client, quantity=0)
        data = rv.get_json()
        assert "error" in data
