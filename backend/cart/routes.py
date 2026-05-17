import uuid

from flask import Blueprint, jsonify, make_response, request

from backend.database import get_db

cart_bp = Blueprint("cart", __name__, url_prefix="/api/cart")

SESSION_COOKIE = "session_id"
MIN_QTY = 1
MAX_QTY = 20


@cart_bp.route("", methods=["GET"])
@cart_bp.route("/", methods=["GET"])
def view_cart():
    session_id = _get_session_id()
    rows = get_db().execute(
        """
        SELECT ci.item_public_id, ci.quantity, i.name, i.price, i.available, i.category
        FROM cart_items AS ci
        JOIN items AS i ON i.public_id = ci.item_public_id
        WHERE ci.session_id = ?
        ORDER BY ci.added_at, i.name
        """,
        (session_id,),
    ).fetchall()

    items = [_cart_row_to_dict(row) for row in rows]
    total = round(sum(item["subtotal"] for item in items), 2)

    payload = {
        "items": items,
        "total": total,
        "subtotal": total,
    }
    return _json_with_session(payload, session_id), 200


@cart_bp.route("", methods=["POST"])
@cart_bp.route("/", methods=["POST"])
def add_to_cart():
    payload = request.get_json(silent=True) or {}
    item_public_id = str(payload.get("item_id", "")).strip()

    valid, error_message, quantity = _parse_quantity(payload.get("quantity", 1))
    if not valid:
        return jsonify({"error": error_message, "code": "BAD_REQUEST"}), 400

    if not item_public_id:
        return jsonify({"error": "item_id is required", "code": "BAD_REQUEST"}), 400

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
        DO UPDATE SET quantity = min(cart_items.quantity + excluded.quantity, ?)
        """,
        (session_id, item_public_id, quantity, MAX_QTY),
    )
    db.commit()

    return _json_with_session({"message": "Item added to cart"}, session_id), 201


@cart_bp.route("/<item_id>", methods=["PATCH"])
def update_cart_item(item_id):
    payload = request.get_json(silent=True) or {}

    valid, error_message, quantity = _parse_quantity(payload.get("quantity"))
    if not valid:
        return jsonify({"error": error_message, "code": "BAD_REQUEST"}), 400

    session_id = _get_session_id()
    db = get_db()

    existing = db.execute(
        """
        SELECT 1
        FROM cart_items
        WHERE session_id = ? AND item_public_id = ?
        """,
        (session_id, item_id),
    ).fetchone()

    if existing is None:
        return jsonify({"error": "Item not in cart", "code": "NOT_FOUND"}), 404

    db.execute(
        """
        UPDATE cart_items
        SET quantity = ?
        WHERE session_id = ? AND item_public_id = ?
        """,
        (quantity, session_id, item_id),
    )
    db.commit()

    return _json_with_session(
        {
            "message": "Quantity updated",
            "item_id": item_id,
            "quantity": quantity,
            "subtotal": _calculate_subtotal(session_id),
        },
        session_id,
    ), 200


@cart_bp.route("/<item_id>", methods=["DELETE"])
def remove_cart_item(item_id):
    session_id = _get_session_id()
    db = get_db()

    result = db.execute(
        """
        DELETE FROM cart_items
        WHERE session_id = ? AND item_public_id = ?
        """,
        (session_id, item_id),
    )
    db.commit()

    if result.rowcount == 0:
        return jsonify({"error": "Item not in cart", "code": "NOT_FOUND"}), 404

    return _json_with_session(
        {
            "message": "Item removed from cart",
            "item_id": item_id,
            "subtotal": _calculate_subtotal(session_id),
        },
        session_id,
    ), 200


@cart_bp.route("", methods=["DELETE"])
@cart_bp.route("/", methods=["DELETE"])
def clear_cart():
    session_id = _get_session_id()
    get_db().execute(
        """
        DELETE FROM cart_items
        WHERE session_id = ?
        """,
        (session_id,),
    )
    get_db().commit()

    return _json_with_session({"message": "Cart cleared", "subtotal": 0.00, "total": 0.00}, session_id), 200


def _parse_quantity(value):
    try:
        quantity = int(value)
    except (TypeError, ValueError):
        return False, "Quantity must be a number", None

    if quantity < MIN_QTY or quantity > MAX_QTY:
        return False, f"Quantity must be between {MIN_QTY} and {MAX_QTY}", None

    return True, "", quantity


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
    subtotal = round(price * quantity, 2)

    item = {
        "item_id": row["item_public_id"],
        "name": row["name"],
        "price": price,
        "quantity": quantity,
        "available": bool(row["available"]),
        "subtotal": subtotal,
        "line_total": subtotal,
    }

    if "category" in row.keys():
        item["category"] = row["category"]

    return item


def _calculate_subtotal(session_id):
    row = get_db().execute(
        """
        SELECT COALESCE(SUM(ci.quantity * i.price), 0) AS subtotal
        FROM cart_items AS ci
        JOIN items AS i ON i.public_id = ci.item_public_id
        WHERE ci.session_id = ?
        """,
        (session_id,),
    ).fetchone()

    return round(float(row["subtotal"]), 2)
