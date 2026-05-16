# backend/order/routes.py
"""
Order Placement slice — Member 3.
Implements POST /api/order per contracts/order.yaml.
Requirements: F-ORD-01 through F-ORD-06, NF-01, NF-05, EC-01, EC-02, EC-03.
"""

import os
import sqlite3
import jwt
from flask import Blueprint, request, jsonify, g, current_app

from .models import PlaceOrderRequest, PlaceOrderResponse, generate_order_id

order_bp = Blueprint("order", __name__)


# ---------------------------------------------------------------------------
# DB helper — mirrors the pattern used in auth/routes.py
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    """Return (or create) the per-request SQLite connection stored on Flask g."""
    if "db" not in g:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Database.db")
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


# ---------------------------------------------------------------------------
# Auth helper — extract customer_public_id from JWT
# ---------------------------------------------------------------------------

def _get_authenticated_customer(db):
    """
    Extract and validate the customer from the Authorization header.
    Returns (customer_public_id, error_response) tuple.
    If valid, error_response is None. If invalid, customer_public_id is None.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, (jsonify({"error": "Missing or invalid Authorization header", "code": "UNAUTHORIZED"}), 401)

    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
        customer_id = payload.get("customer_id")
        if not customer_id:
            return None, (jsonify({"error": "Invalid token payload", "code": "UNAUTHORIZED"}), 401)

        user = db.execute(
            "SELECT customer_public_id FROM customers WHERE customer_public_id = ?",
            (customer_id,),
        ).fetchone()

        if not user:
            return None, (jsonify({"error": "User not found", "code": "UNAUTHORIZED"}), 401)

        return user["customer_public_id"], None

    except jwt.ExpiredSignatureError:
        return None, (jsonify({"error": "Token has expired", "code": "TOKEN_EXPIRED"}), 401)
    except jwt.InvalidTokenError:
        return None, (jsonify({"error": "Invalid token", "code": "INVALID_TOKEN"}), 401)


# ---------------------------------------------------------------------------
# POST /api/order
# ---------------------------------------------------------------------------

@order_bp.route("", methods=["POST"])
def place_order():
    """
    Place an order from the current session cart.

    Steps (per approved implementation plan):
      A. Validate customer_name (regex, F-ORD-06 / EC-03)
      B. Fetch cart joined with items
      C. Validate cart non-empty + all items available
      D. Idempotency: return existing order if duplicate within 5 s (EC-01)
      E. Compute total — locked at placement time (F-ORD-04)
      F. INSERT into orders
      G. INSERT into order_items (price snapshot)
      H. DELETE cart_items for this session
      I. COMMIT
    """

    # ------------------------------------------------------------------
    # A. Parse & validate request body
    # ------------------------------------------------------------------
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON", "code": "INVALID_INPUT"}), 422

    try:
        order_req = PlaceOrderRequest.from_json(data)
        order_req.validate()
    except ValueError as exc:
        return jsonify({"error": str(exc), "code": "INVALID_INPUT"}), 422

    customer_name = order_req.customer_name.strip()

    # ------------------------------------------------------------------
    # Resolve session_id from cookie (session cookie set by browser)
    # ------------------------------------------------------------------
    session_id = request.cookies.get("session_id")
    if not session_id:
        # No session means cart cannot exist — treat as empty
        return jsonify({"error": "Cannot place an order with an empty cart", "code": "EMPTY_CART"}), 400

    db = get_db()

    # ------------------------------------------------------------------
    # Authenticate user — resolve customer_public_id from JWT
    # ------------------------------------------------------------------
    customer_public_id, auth_error = _get_authenticated_customer(db)
    if auth_error:
        return auth_error

    # ------------------------------------------------------------------
    # D. Idempotency check — duplicate POST within 5 s (EC-01)
    # Must run BEFORE cart validation: the first order clears the cart,
    # so a duplicate POST would otherwise fail with EMPTY_CART.
    # ------------------------------------------------------------------
    existing = db.execute(
        """
        SELECT order_public_id, status, total
        FROM orders
        WHERE session_id = ?
          AND created_at >= datetime('now', '-5 seconds')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (session_id,),
    ).fetchone()

    if existing:
        # Return exact PlaceOrderResponse schema — same shape as 201
        response = PlaceOrderResponse(
            order_id=existing["order_public_id"],
            status=existing["status"],
            total=existing["total"],
        )
        return jsonify(response.to_dict()), 200

    # ------------------------------------------------------------------
    # B. Fetch cart items joined with live item data
    # ------------------------------------------------------------------
    cart_rows = db.execute(
        """
        SELECT
            ci.item_public_id,
            ci.quantity,
            i.name        AS item_name,
            i.price       AS unit_price,
            i.available
        FROM cart_items ci
        JOIN items i ON i.public_id = ci.item_public_id
        WHERE ci.session_id = ?
        """,
        (session_id,),
    ).fetchall()

    # ------------------------------------------------------------------
    # C1. Validate cart is non-empty (F-ORD-03)
    # ------------------------------------------------------------------
    if not cart_rows:
        return jsonify({"error": "Cannot place an order with an empty cart", "code": "EMPTY_CART"}), 400

    # ------------------------------------------------------------------
    # C2. Validate all items are available (409 ITEM_UNAVAILABLE)
    # ------------------------------------------------------------------
    for row in cart_rows:
        if not row["available"]:
            return jsonify(
                {
                    "error": f"Item '{row['item_name']}' is currently unavailable",
                    "code": "ITEM_UNAVAILABLE",
                }
            ), 409

    # ------------------------------------------------------------------
    # E. Compute locked total (F-ORD-04, EC-02)
    # ------------------------------------------------------------------
    total = round(
        sum(row["unit_price"] * row["quantity"] for row in cart_rows),
        2,
    )

    # ------------------------------------------------------------------
    # F-H. Atomic transaction: INSERT order → INSERT order_items → DELETE cart
    # ------------------------------------------------------------------
    order_public_id = generate_order_id()

    try:
        db.execute("BEGIN")

        # F. Insert order row
        db.execute(
            """
            INSERT INTO orders
                (order_public_id, customer_public_id, customer_name, total, status, session_id)
            VALUES
                (?, ?, ?, ?, 'pending', ?)
            """,
            (
                order_public_id,
                customer_public_id,
                customer_name,
                total,
                session_id,
            ),
        )

        # G. Insert order_items — snapshot unit prices (EC-02)
        db.executemany(
            """
            INSERT INTO order_items
                (order_public_id, item_public_id, item_name, unit_price, quantity)
            VALUES
                (?, ?, ?, ?, ?)
            """,
            [
                (
                    order_public_id,
                    row["item_public_id"],
                    row["item_name"],
                    row["unit_price"],   # locked at placement time
                    row["quantity"],
                )
                for row in cart_rows
            ],
        )

        # H. Clear cart for this session (F-ORD-02)
        db.execute(
            "DELETE FROM cart_items WHERE session_id = ?",
            (session_id,),
        )

        # I. Commit
        db.execute("COMMIT")

    except Exception:
        db.execute("ROLLBACK")
        raise

    # ------------------------------------------------------------------
    # Return 201 with exact PlaceOrderResponse schema
    # ------------------------------------------------------------------
    response = PlaceOrderResponse(
        order_id=order_public_id,
        status="pending",
        total=total,
    )
    return jsonify(response.to_dict()), 201
