from flask import Blueprint, jsonify, request

from backend.database import get_db

menu_bp = Blueprint("menu", __name__, url_prefix="/api/menu")


@menu_bp.route("", methods=["GET"])
def list_menu():
    """Return menu items from the new items table without exposing row ids."""
    category = request.args.get("category", "").strip()
    db = get_db()

    if category:
        rows = db.execute(
            """
            SELECT public_id, name, description, price, category,
                   available, allergens, image_url
            FROM items
            WHERE lower(category) = lower(?)
            ORDER BY lower(category), name
            """,
            (category,),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT public_id, name, description, price, category,
                   available, allergens, image_url
            FROM items
            ORDER BY lower(category), name
            """
        ).fetchall()

    return jsonify({"items": [_row_to_dict(row) for row in rows]}), 200


@menu_bp.route("/<string:public_id>", methods=["GET"])
def get_item(public_id):
    """Return one menu item by public UUID, never by internal row id."""
    row = get_db().execute(
        """
        SELECT public_id, name, description, price, category,
               available, allergens, image_url
        FROM items
        WHERE public_id = ?
        """,
        (public_id,),
    ).fetchone()

    if row is None:
        return jsonify({"error": "Menu item not found", "code": "NOT_FOUND"}), 404

    return jsonify(_row_to_dict(row)), 200


def _row_to_dict(row):
    allergens = [
        allergen.strip()
        for allergen in (row["allergens"] or "").split(",")
        if allergen.strip()
    ]

    return {
        "id": row["public_id"],
        "name": row["name"],
        "description": row["description"] or "",
        "price": round(float(row["price"]), 2),
        "category": row["category"],
        "available": bool(row["available"]),
        "allergens": allergens,
        "image_url": row["image_url"] or "",
    }
