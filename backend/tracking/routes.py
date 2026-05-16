from flask import Blueprint, jsonify

from backend.database import get_db
from backend.tracking.models import TrackingResponse, calculate_eta


tracking_bp = Blueprint("tracking", __name__)

# Kept only so stale tests/imports do not crash; real tracking is DB-backed.
orders_db = {}


@tracking_bp.route("/<order_id>", methods=["GET"])
def get_order_tracking(order_id):
    db = get_db()
    order = db.execute(
        """
        SELECT order_public_id, status, updated_at, created_at
        FROM orders
        WHERE order_public_id = ?
        """,
        (order_id,),
    ).fetchone()

    if order is None:
        return jsonify({"error": "Order not found", "code": "NOT_FOUND"}), 404

    events = db.execute(
        """
        SELECT status, event_timestamp
        FROM tracking_events
        WHERE order_public_id = ?
        ORDER BY event_timestamp ASC, id ASC
        """,
        (order_id,),
    ).fetchall()

    last_updated = (
        events[-1]["event_timestamp"]
        if events
        else order["updated_at"] or order["created_at"]
    )

    if order["status"] == "completed":
        eta = 0
    else:
        pending_count = db.execute(
            """
            SELECT COUNT(*) AS count
            FROM orders
            WHERE status = 'pending'
            """
        ).fetchone()["count"]
        eta = calculate_eta(int(pending_count))

    response = TrackingResponse(
        order_id=order["order_public_id"],
        status=order["status"],
        last_updated=_format_timestamp(last_updated),
        estimated_wait_minutes=eta,
    ).to_dict()
    response["timeline"] = [
        {
            "status": row["status"],
            "timestamp": _format_timestamp(row["event_timestamp"]),
        }
        for row in events
    ]

    return jsonify(response), 200


def _format_timestamp(value):
    return str(value).replace(" ", "T") + "Z" if value else ""
