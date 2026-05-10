"""
backend/menu/routes.py  —  Menu Blueprint (Member 1's slice)

Endpoints:
  GET  /api/menu          → list all available (and unavailable) items
  GET  /api/menu/<item_id> → single item detail

Requirements covered:
  F-MNU-01  items grouped by category (client groups, server returns flat list)
  F-MNU-02  name, price, description, allergens, available flag
  F-MNU-04  unavailable items included with available=False so frontend
            can show "Sold out" instead of hiding them entirely
  F-MNU-05  response must be under 500 ms — no N+1 queries here
  F-MNU-06  never expose raw DB row id in a guessable sequence;
            items use UUID public_id
  NF-01     Content-Type: application/json on all responses
  NF-05     parameterised queries only (see db helpers)
"""

from flask import Blueprint, jsonify, request
from backend.database import get_db

# Register this blueprint with prefix /api/menu in app.py
menu_bp = Blueprint('menu', __name__, url_prefix='/api/menu')


# ── GET /api/menu ──────────────────────────────────────────
@menu_bp.route('', methods=['GET'])
def list_menu():
    """
    Returns the full menu.
    Optional query param:  ?category=coffee|pastry|cold|seasonal
    Responds within 500 ms because it runs a single SELECT (F-MNU-05).
    """
    category = request.args.get('category', '').strip().lower()

    db = get_db()

    # Parameterised query — never string-interpolate user input (NF-05)
    if category:
        rows = db.execute(
            """
            SELECT public_id, name, description, price,
                   category, available, allergens, image_url
            FROM   items
            WHERE  category = ?
            ORDER  BY category, name
            """,
            (category,)
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT public_id, name, description, price,
                   category, available, allergens, image_url
            FROM   items
            ORDER  BY category, name
            """
        ).fetchall()

    items = [_row_to_dict(row) for row in rows]

    return jsonify({'items': items}), 200


# ── GET /api/menu/<public_id> ──────────────────────────────
@menu_bp.route('/<string:public_id>', methods=['GET'])
def get_item(public_id):
    """
    Returns detail for a single menu item by its UUID public_id.
    Used by the cart page to validate item availability before adding.
    """
    db = get_db()

    row = db.execute(
        """
        SELECT public_id, name, description, price,
               category, available, allergens, image_url
        FROM   items
        WHERE  public_id = ?
        """,
        (public_id,)
    ).fetchone()

    if row is None:
        # F-MNU-06: 404 for unknown items, never leak DB internals
        return jsonify({'message': 'Item not found'}), 404

    return jsonify(_row_to_dict(row)), 200


# ── Private helper ─────────────────────────────────────────
def _row_to_dict(row):
    """
    Converts a sqlite3.Row to a serialisable dict.
    allergens is stored as comma-separated string in DB,
    returned as a list for the frontend.
    """
    allergens_raw = row['allergens'] or ''
    allergens_list = [a.strip() for a in allergens_raw.split(',') if a.strip()]

    return {
        'id':          row['public_id'],          # UUID — never the raw rowid
        'name':        row['name'],
        'description': row['description'],
        'price':       round(float(row['price']), 2),   # always 2 dp
        'category':    row['category'],
        'available':   bool(row['available']),    # SQLite stores 0/1
        'allergens':   allergens_list,            # EC-07
        'image_url':   row['image_url']           # <-- This pushes the image to the frontend!
    }