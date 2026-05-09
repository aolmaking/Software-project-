# backend/tracking/routes.py
from flask import Blueprint, jsonify
from datetime import datetime

tracking_bp = Blueprint('tracking_bp', __name__)

# Mock database of orders with their creation time
orders_db = {}

@tracking_bp.route('/<order_id>', methods=['GET'])
def get_order_tracking(order_id):
    if order_id not in orders_db:
        # Initialize order tracking for demo purposes
        # Assuming payment just happened
        orders_db[order_id] = {
            'created_at': datetime.now()
        }
    
    order = orders_db[order_id]
    elapsed = datetime.now() - order['created_at']
    elapsed_minutes = elapsed.total_seconds() / 60

    # Auto-reset for demo purposes if the user visits the page way after testing
    if elapsed_minutes >= 10:
        orders_db[order_id]['created_at'] = datetime.now()
        elapsed_minutes = 0

    if elapsed_minutes < 2:
        status = "pending"
    elif elapsed_minutes < 4:
        status = "brewing"
    elif elapsed_minutes < 6:
        status = "delivering"
    else:
        status = "done"

    return jsonify({
        "order_id": order_id,
        "status": status,
        "elapsed_minutes": round(elapsed_minutes, 2)
    })
