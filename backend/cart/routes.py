"""
backend/cart/routes.py
Cart module — Flask Blueprint
SOFA Coffee Shop & Bakery Ordering System
"""

from flask import Blueprint, jsonify, session, current_app
import sqlite3
import os

cart_bp = Blueprint("cart", __name__, url_prefix="/api/cart")

# ─────────────────────────────────────────
# Constants
# ─────────────────────────────────────────
MIN_QTY = 1
MAX_QTY = 20
DB_PATH = os.environ.get("SOFA_DB_PATH", "sofa.db")


# ─────────────────────────────────────────
# DB helper
# ─────────────────────────────────────────
def get_db():
    """Return a SQLite connection with row_factory set."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─────────────────────────────────────────
# Cart session helpers
# ─────────────────────────────────────────
def get_cart() -> dict:
    """
    Return the current session cart.
    Structure: { item_id: quantity, ... }
    """
    return session.get("cart", {})


def save_cart(cart: dict) -> None:
    """Persist cart dict into the session."""
    session["cart"] = cart
    session.modified = True


# ─────────────────────────────────────────
# Validation helper
# ─────────────────────────────────────────
def validate_quantity(value) -> tuple[bool, str]:
    """
    Returns (is_valid, error_message).
    Accepts int in [MIN_QTY, MAX_QTY].
    Rejects non-int, zero, negative, or oversized values.
    """
    if not isinstance(value, int) or isinstance(value, bool):
        return False, "Quantity must be an integer."
    if value < MIN_QTY:
        return False, f"Quantity must be at least {MIN_QTY}."
    if value > MAX_QTY:
        return False, f"Quantity must not exceed {MAX_QTY}."
    return True, ""


# ─────────────────────────────────────────
# Menu item helper
# ─────────────────────────────────────────
def get_menu_item(item_id: str) -> dict | None:
    """
    Fetch a menu item row from the `items` table.
    Returns a dict or None if not found.
    Uses parameterized query — no string concatenation.
    """
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, name, price, description, available, allergens, category "
            "FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ─────────────────────────────────────────
# Subtotal helper
# ─────────────────────────────────────────
def calculate_subtotal(cart: dict) -> float:
    """
    Calculate cart subtotal using LIVE database prices.
    subtotal = Σ(quantity × current_price)  rounded to 2 dp.
    """
    if not cart:
        return 0.00

    conn = get_db()
    try:
        total = 0.0
        for item_id, qty in cart.items():
            row = conn.execute(
                "SELECT price FROM items WHERE id = ?", (item_id,)
            ).fetchone()
            if row:
                total += row["price"] * qty
        return round(total, 2)
    finally:
        conn.close()


# ─────────────────────────────────────────
# Cart item serialiser
# ─────────────────────────────────────────
def build_cart_items(cart: dict) -> list[dict]:
    """
    Return list of cart item dicts with live DB data merged in.
    Items whose DB record no longer exists are silently omitted.
    """
    if not cart:
        return []

    conn = get_db()
    items = []
    try:
        for item_id, qty in cart.items():
            row = conn.execute(
                "SELECT id, name, price, description, available, category "
                "FROM items WHERE id = ?",
                (item_id,),
            ).fetchone()
            if row:
                items.append(
                    {
                        "item_id": row["id"],
                        "name": row["name"],
                        "price": round(row["price"], 2),
                        "quantity": qty,
                        "line_total": round(row["price"] * qty, 2),
                        "category": row["category"],
                        "available": bool(row["available"]),
                    }
                )
    finally:
        conn.close()
    return items


# ═══════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════


# GET /api/cart
@cart_bp.get("/")
def view_cart():
    """Return full cart with live prices and subtotal."""
    cart = get_cart()
    items = build_cart_items(cart)
    subtotal = calculate_subtotal(cart)
    return jsonify({"items": items, "subtotal": subtotal}), 200


# POST /api/cart
@cart_bp.post("/")
def add_to_cart():
    """
    Add an item to the cart or increment its quantity.

    Request JSON:
        { "item_id": "<id>", "quantity": <int> }
    """
    from flask import request

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    item_id = data.get("item_id")
    quantity = data.get("quantity")

    # ── Validate item_id ──
    if not item_id or not isinstance(item_id, str):
        return jsonify({"error": "item_id is required and must be a string."}), 400

    # ── Validate quantity ──
    valid, msg = validate_quantity(quantity)
    if not valid:
        return jsonify({"error": msg}), 422

    # ── Fetch menu item ──
    menu_item = get_menu_item(item_id)
    if menu_item is None:
        return jsonify({"error": "Item not found."}), 404

    # ── Check availability (F-CRT-06) ──
    if not menu_item["available"]:
        return jsonify({"error": "Item is currently unavailable."}), 409

    # ── Update cart ──
    cart = get_cart()
    current_qty = cart.get(item_id, 0)
    new_qty = current_qty + quantity

    # ── Enforce max after addition ──
    if new_qty > MAX_QTY:
        return (
            jsonify(
                {
                    "error": f"Total quantity cannot exceed {MAX_QTY}. "
                    f"You already have {current_qty} in your cart."
                }
            ),
            422,
        )

    cart[item_id] = new_qty
    save_cart(cart)

    return (
        jsonify(
            {
                "message": "Item added to cart.",
                "item_id": item_id,
                "quantity": new_qty,
                "subtotal": calculate_subtotal(cart),
            }
        ),
        200,
    )


# PATCH /api/cart/<item_id>
@cart_bp.patch("/<item_id>")
def update_cart_item(item_id: str):
    """
    Set an explicit quantity for a cart item.

    Request JSON:
        { "quantity": <int> }
    """
    from flask import request

    cart = get_cart()
    if item_id not in cart:
        return jsonify({"error": "Item not in cart."}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    quantity = data.get("quantity")

    # ── Validate quantity ──
    valid, msg = validate_quantity(quantity)
    if not valid:
        return jsonify({"error": msg}), 422

    cart[item_id] = quantity
    save_cart(cart)

    return (
        jsonify(
            {
                "message": "Quantity updated.",
                "item_id": item_id,
                "quantity": quantity,
                "subtotal": calculate_subtotal(cart),
            }
        ),
        200,
    )


# DELETE /api/cart/<item_id>
@cart_bp.delete("/<item_id>")
def remove_cart_item(item_id: str):
    """Remove a single item from the cart."""
    cart = get_cart()
    if item_id not in cart:
        return jsonify({"error": "Item not in cart."}), 404

    del cart[item_id]
    save_cart(cart)

    return (
        jsonify(
            {
                "message": "Item removed from cart.",
                "item_id": item_id,
                "subtotal": calculate_subtotal(cart),
            }
        ),
        200,
    )


# DELETE /api/cart
@cart_bp.delete("/")
def clear_cart():
    """Remove all items from the cart."""
    save_cart({})
    return jsonify({"message": "Cart cleared.", "subtotal": 0.00}), 200
