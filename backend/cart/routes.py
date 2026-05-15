import uuid

from flask import Blueprint, jsonify, make_response, request

from backend.database import get_db

cart_bp = Blueprint("cart", __name__, url_prefix="/api/cart")
SESSION_COOKIE = "sofa_session_id"


@cart_bp.route("", methods=["GET"])
def get_cart():
    session_id = _get_session_id()
    rows = get_db().execute(
        """
        SELECT ci.item_public_id, ci.quantity, i.name, i.price, i.available
        FROM cart_items AS ci
        JOIN items AS i ON i.public_id = ci.item_public_id
        WHERE ci.session_id = ?
        ORDER BY ci.added_at, i.name
        """,
        (session_id,),
    ).fetchall()

    items = [_cart_row_to_dict(row) for row in rows]
    payload = {
        "items": items,
        "total": round(sum(item["subtotal"] for item in items), 2),
    }
    return _json_with_session(payload, session_id), 200


@cart_bp.route("", methods=["POST"])
def add_to_cart():
    payload = request.get_json(silent=True) or {}
    item_public_id = str(payload.get("item_id", "")).strip()

    try:
        quantity = int(payload.get("quantity", 1))
    except (TypeError, ValueError):
        return jsonify({"error": "Quantity must be a number", "code": "BAD_REQUEST"}), 400

    if not item_public_id or quantity < 1 or quantity > 20:
        return jsonify({"error": "Invalid cart item", "code": "BAD_REQUEST"}), 400

    db = get_db()
    item = db.execute(
        """
        SELECT public_id, available
        FROM items
        WHERE public_id = ?
        """,
        (item_public_id,),
    ).fetchone()

    if item is None:
        return jsonify({"error": "Menu item not found", "code": "NOT_FOUND"}), 404

    if not bool(item["available"]):
        return jsonify({"error": "Item is sold out", "code": "SOLD_OUT"}), 409

    session_id = _get_session_id()
    db.execute(
        """
        INSERT INTO cart_items (session_id, item_public_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id, item_public_id)
        DO UPDATE SET quantity = min(cart_items.quantity + excluded.quantity, 20)
        """,
        (session_id, item_public_id, quantity),
    )
    db.commit()

    return _json_with_session({"message": "Item added to cart"}, session_id), 201


def _get_session_id():
    session_id = request.cookies.get(SESSION_COOKIE, "").strip()
    if len(session_id) == 36:
        return session_id
    return str(uuid.uuid4())


def _json_with_session(payload, session_id):
    response = make_response(jsonify(payload))
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=60 * 60 * 24 * 30,
        samesite="Lax",
    )
    return response


def _cart_row_to_dict(row):
    price = round(float(row["price"]), 2)
    quantity = int(row["quantity"])
    return {
        "item_id": row["item_public_id"],
        "name": row["name"],
        "price": price,
        "quantity": quantity,
        "available": bool(row["available"]),
        "subtotal": round(price * quantity, 2),
    }
