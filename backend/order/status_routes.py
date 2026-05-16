from flask import Blueprint, jsonify, request

from backend.database import get_db


status_bp = Blueprint("status", __name__)

VALID_STATUSES = ("pending", "preparing", "ready", "completed")
NEXT_STATUS = {
    "pending": "preparing",
    "preparing": "ready",
    "ready": "completed",
}


@status_bp.route("", methods=["GET"])
@status_bp.route("/", methods=["GET"])
def list_active_orders():
    rows = get_db().execute(
        """
        SELECT order_public_id, customer_name, status, total, created_at
        FROM orders
        WHERE status != 'completed'
        ORDER BY created_at ASC
        """
    ).fetchall()

    return jsonify({
        "orders": [
            {
                "order_id": row["order_public_id"],
                "customer_name": row["customer_name"],
                "status": row["status"],
                "total": round(float(row["total"]), 2),
                "created_at": _format_timestamp(row["created_at"]),
            }
            for row in rows
        ]
    }), 200


@status_bp.route("/<order_id>", methods=["PATCH"])
def update_order_status(order_id):
    payload = request.get_json(silent=True) or {}
    requested_status = str(payload.get("status", "")).strip().lower()

    if requested_status not in VALID_STATUSES:
        return jsonify({
            "error": "Invalid status",
            "code": "INVALID_STATUS_TRANSITION",
        }), 400

    db = get_db()
    order = db.execute(
        """
        SELECT order_public_id, status
        FROM orders
        WHERE order_public_id = ?
        """,
        (order_id,),
    ).fetchone()

    if order is None:
        return jsonify({"error": "Order not found", "code": "NOT_FOUND"}), 404

    current_status = order["status"]
    if requested_status == current_status:
        return jsonify({"order_id": order_id, "status": current_status}), 200

    if NEXT_STATUS.get(current_status) != requested_status:
        return jsonify({
            "error": f"Cannot transition from '{current_status}' to '{requested_status}'",
            "code": "INVALID_STATUS_TRANSITION",
        }), 400

    db.execute(
        """
        UPDATE orders
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE order_public_id = ?
        """,
        (requested_status, order_id),
    )
    db.execute(
        """
        INSERT INTO tracking_events (order_public_id, status)
        VALUES (?, ?)
        """,
        (order_id, requested_status),
    )
    db.commit()

    return jsonify({"order_id": order_id, "status": requested_status}), 200


def _format_timestamp(value):
    return str(value).replace(" ", "T") + "Z" if value else ""
