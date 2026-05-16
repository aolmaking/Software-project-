from flask import Blueprint, jsonify, g
from datetime import datetime, timedelta

from backend.database import get_db
from backend.auth.routes import require_auth

tracking_bp = Blueprint("tracking", __name__)

def sync_order_status(db, order):
    order_id = order["order_public_id"]
    current_status = order["status"]
    
    if current_status == "completed":
        return current_status
        
    created_at_val = order["created_at"]
    if isinstance(created_at_val, str):
        created_at = datetime.strptime(created_at_val, "%Y-%m-%d %H:%M:%S")
    else:
        created_at = created_at_val
    now = datetime.utcnow()
    diff_minutes = (now - created_at).total_seconds() / 60.0
    
    expected_status = "pending"
    if diff_minutes >= 6:
        expected_status = "completed"
    elif diff_minutes >= 4:
        expected_status = "ready"
    elif diff_minutes >= 2:
        expected_status = "preparing"
        
    if expected_status != current_status:
        statuses = ["pending", "preparing", "ready", "completed"]
        current_idx = statuses.index(current_status)
        expected_idx = statuses.index(expected_status)
        
        for i in range(current_idx + 1, expected_idx + 1):
            s = statuses[i]
            event_time = created_at + timedelta(minutes=i*2)
            if s == expected_status:
                event_time = now
            
            db.execute("INSERT INTO tracking_events (order_public_id, status, event_timestamp) VALUES (?, ?, ?)", 
                       (order_id, s, event_time.strftime("%Y-%m-%d %H:%M:%S")))
                       
        db.execute("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_public_id = ?", (expected_status, order_id))
        db.commit()
        
    return expected_status

def _format_timestamp(value):
    return str(value).replace(" ", "T") + "Z" if value else ""

@tracking_bp.route("/active", methods=["GET"])
@require_auth
def get_active_orders():
    db = get_db()
    customer_id = g.user["customer_public_id"]
    
    orders = db.execute(
        """
        SELECT order_public_id, status, total, created_at, updated_at
        FROM orders
        WHERE customer_public_id = ? AND status != 'completed'
        ORDER BY created_at DESC
        """,
        (customer_id,)
    ).fetchall()
    
    active_orders = []
    for order in orders:
        status = sync_order_status(db, order)
        if status != "completed":
            items = db.execute("SELECT item_name, quantity FROM order_items WHERE order_public_id = ?", (order["order_public_id"],)).fetchall()
            item_summary = ", ".join([f"{item['quantity']}x {item['item_name']}" for item in items])
            
            events = db.execute(
                "SELECT status, event_timestamp FROM tracking_events WHERE order_public_id = ? ORDER BY event_timestamp ASC",
                (order["order_public_id"],)
            ).fetchall()
            
            created_at_val = order["created_at"]
            if isinstance(created_at_val, str):
                created_at = datetime.strptime(created_at_val, "%Y-%m-%d %H:%M:%S")
            else:
                created_at = created_at_val
            
            now = datetime.utcnow()
            diff_minutes = (now - created_at).total_seconds() / 60.0
            eta = max(0, 6 - int(diff_minutes))
            
            active_orders.append({
                "order_id": order["order_public_id"],
                "status": status,
                "total": round(order["total"], 2),
                "item_summary": item_summary,
                "created_at": _format_timestamp(order["created_at"]),
                "estimated_wait_minutes": eta,
                "timeline": [{"status": e["status"], "timestamp": _format_timestamp(e["event_timestamp"])} for e in events]
            })
            
    return jsonify({"orders": active_orders}), 200

@tracking_bp.route("/history", methods=["GET"])
@require_auth
def get_history_orders():
    db = get_db()
    customer_id = g.user["customer_public_id"]
    
    # Sync active orders first so they can become completed if time passed
    active_orders = db.execute("SELECT * FROM orders WHERE customer_public_id = ? AND status != 'completed'", (customer_id,)).fetchall()
    for o in active_orders:
        sync_order_status(db, o)
    
    orders = db.execute(
        """
        SELECT order_public_id, status, total, created_at, updated_at
        FROM orders
        WHERE customer_public_id = ? AND status = 'completed'
        ORDER BY created_at DESC
        """,
        (customer_id,)
    ).fetchall()
    
    history_orders = []
    for order in orders:
        items = db.execute("SELECT item_name, unit_price, quantity FROM order_items WHERE order_public_id = ?", (order["order_public_id"],)).fetchall()
        
        events = db.execute(
            "SELECT status, event_timestamp FROM tracking_events WHERE order_public_id = ? ORDER BY event_timestamp ASC",
            (order["order_public_id"],)
        ).fetchall()
        
        history_orders.append({
            "order_id": order["order_public_id"],
            "status": order["status"],
            "total": round(order["total"], 2),
            "created_at": _format_timestamp(order["created_at"]),
            "updated_at": _format_timestamp(order["updated_at"]),
            "items": [{"name": i["item_name"], "price": i["unit_price"], "quantity": i["quantity"]} for i in items],
            "timeline": [{"status": e["status"], "timestamp": _format_timestamp(e["event_timestamp"])} for e in events]
        })
        
    return jsonify({"orders": history_orders}), 200
