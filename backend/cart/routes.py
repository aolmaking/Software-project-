

from flask import Blueprint, jsonify, request

# ─────────────────────────────────────────────
# Blueprint Setup
# ─────────────────────────────────────────────

cart_bp = Blueprint("cart_bp", __name__)


# ─────────────────────────────────────────────
# Mock Menu Data (temporary — waiting on Member 1's Menu module)
# ─────────────────────────────────────────────

MENU_ITEMS = {
    "1": {"name": "Burger", "price": 120, "available": True},
    "2": {"name": "Pizza",  "price": 200, "available": False},
    "3": {"name": "Pasta",  "price": 150, "available": True},
}


# ─────────────────────────────────────────────
# In-Memory Cart Storage (temporary — no database yet)
# Each item: { item_id, name, price, quantity, subtotal }
# ─────────────────────────────────────────────

cart_items = []


# ─────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────

def find_cart_item(item_id):
    """
    Search the cart for an item by its item_id.
    Returns the cart item dict if found, or None if not present.
    """
    for item in cart_items:
        if item["item_id"] == item_id:
            return item
    return None


def calculate_total():
    """
    Calculate and return the total price of all items currently in the cart.
    """
    return sum(item["subtotal"] for item in cart_items)


def validate_quantity(quantity):
    """
    Validate that a quantity is within the allowed range [1, 20].
    Returns True if valid, False otherwise.
    """
    return isinstance(quantity, int) and 1 <= quantity <= 20


def build_cart_response():
    """
    Build and return the standard cart response payload.
    Used by multiple endpoints to avoid duplicated logic.
    """
    return jsonify({
        "items": cart_items,
        "total": calculate_total()
    })


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

# GET /api/cart
# Returns all items currently in the cart along with the total price.
@cart_bp.route("/api/cart", methods=["GET"])
def get_cart():
    return build_cart_response(), 200


# POST /api/cart
# Adds a new item to the cart, or increases its quantity if it already exists.
@cart_bp.route("/api/cart", methods=["POST"])
def add_to_cart():
    # Safely parse incoming JSON — return 400 if body is missing or malformed
    data = request.get_json(silent=True)
    if not data:
        return jsonify({
            "error": "Invalid or missing JSON body",
            "code": "INVALID_REQUEST"
        }), 400

    item_id  = str(data.get("item_id", "")).strip()
    quantity = data.get("quantity")

    # Validate quantity before anything else
    if not validate_quantity(quantity):
        return jsonify({
            "error": "Quantity must be between 1 and 20",
            "code": "INVALID_QUANTITY"
        }), 422

    # Check that the requested item exists in the menu
    menu_item = MENU_ITEMS.get(item_id)
    if not menu_item:
        return jsonify({
            "error": "Item not found",
            "code": "ITEM_NOT_FOUND"
        }), 404

    # Check that the item is currently available
    if not menu_item["available"]:
        return jsonify({
            "error": "Item is currently unavailable",
            "code": "ITEM_UNAVAILABLE"
        }), 409

    # If the item is already in the cart, increase its quantity
    existing = find_cart_item(item_id)
    if existing:
        existing["quantity"] += quantity
        existing["subtotal"]  = existing["price"] * existing["quantity"]
    else:
        # Otherwise, add it as a new entry
        cart_items.append({
            "item_id":  item_id,
            "name":     menu_item["name"],
            "price":    menu_item["price"],
            "quantity": quantity,
            "subtotal": menu_item["price"] * quantity,
        })

    return build_cart_response(), 200


# PATCH /api/cart/<item_id>
# Updates the quantity of an existing cart item.
# Setting quantity to 0 automatically removes the item.
@cart_bp.route("/api/cart/<item_id>", methods=["PATCH"])
def update_cart_item(item_id):
    # Safely parse incoming JSON
    data = request.get_json(silent=True)
    if not data:
        return jsonify({
            "error": "Invalid or missing JSON body",
            "code": "INVALID_REQUEST"
        }), 400

    quantity = data.get("quantity")

    # Check that the item exists in the cart
    cart_item = find_cart_item(item_id)
    if not cart_item:
        return jsonify({
            "error": "Cart item not found",
            "code": "CART_ITEM_NOT_FOUND"
        }), 404

    # quantity == 0 is a special case: treat it as a delete request
    if quantity == 0:
        cart_items.remove(cart_item)
        return build_cart_response(), 200

    # For all other values, apply the normal [1, 20] validation
    if not validate_quantity(quantity):
        return jsonify({
            "error": "Quantity must be between 1 and 20",
            "code": "INVALID_QUANTITY"
        }), 422

    # Apply the update
    cart_item["quantity"] = quantity
    cart_item["subtotal"] = cart_item["price"] * quantity

    return build_cart_response(), 200


# DELETE /api/cart/<item_id>
# Removes an item completely from the cart.
@cart_bp.route("/api/cart/<item_id>", methods=["DELETE"])
def delete_cart_item(item_id):
    cart_item = find_cart_item(item_id)

    if not cart_item:
        return jsonify({
            "error": "Cart item not found",
            "code": "CART_ITEM_NOT_FOUND"
        }), 404

    cart_items.remove(cart_item)

    return jsonify({"message": "Item removed successfully"}), 200# backend/cart/routes.py
