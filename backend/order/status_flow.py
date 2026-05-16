from datetime import datetime, timedelta
from math import ceil


STATUS_FLOW = (
    ("pending", 0),
    ("preparing", 2 * 60),
    ("ready", 4 * 60),
    ("completed", 6 * 60),
)
STATUS_INDEX = {status: index for index, (status, _) in enumerate(STATUS_FLOW)}
COMPLETION_SECONDS = 6 * 60


def sync_customer_orders(db, customer_public_id, now=None):
    rows = db.execute(
        """
        SELECT order_public_id, created_at, status
        FROM orders
        WHERE customer_public_id = ?
        """,
        (customer_public_id,),
    ).fetchall()

    changed = False
    for row in rows:
        changed = sync_order_status(db, row, now=now) or changed

    if changed:
        db.commit()


def sync_order_status(db, order_or_row, now=None):
    row = order_or_row
    if isinstance(order_or_row, str):
        row = db.execute(
            """
            SELECT order_public_id, created_at, status
            FROM orders
            WHERE order_public_id = ?
            """,
            (order_or_row,),
        ).fetchone()

    if row is None:
        return False

    order_id = row["order_public_id"]
    created_at = parse_db_timestamp(row["created_at"])
    current_status = status_for_created_at(created_at, now=now)
    current_index = STATUS_INDEX[current_status]
    stored_status = row["status"]
    stored_index = STATUS_INDEX.get(stored_status, 0)
    changed = False

    existing_events = {
        event["status"]
        for event in db.execute(
            """
            SELECT status
            FROM tracking_events
            WHERE order_public_id = ?
            """,
            (order_id,),
        ).fetchall()
    }

    for status, offset_seconds in STATUS_FLOW[: current_index + 1]:
        if status not in existing_events:
            db.execute(
                """
                INSERT INTO tracking_events (order_public_id, status, event_timestamp)
                VALUES (?, ?, ?)
                """,
                (order_id, status, sqlite_timestamp(created_at + timedelta(seconds=offset_seconds))),
            )
            changed = True

    if current_index > stored_index:
        db.execute(
            """
            UPDATE orders
            SET status = ?
            WHERE order_public_id = ?
            """,
            (current_status, order_id),
        )
        changed = True

    return changed


def status_for_created_at(created_at, now=None):
    created = parse_db_timestamp(created_at)
    now_dt = now or datetime.utcnow()
    elapsed_seconds = max(0, (now_dt - created).total_seconds())

    status = "pending"
    for candidate, threshold in STATUS_FLOW:
        if elapsed_seconds >= threshold:
            status = candidate
    return status


def remaining_minutes(created_at, now=None):
    created = parse_db_timestamp(created_at)
    now_dt = now or datetime.utcnow()
    elapsed_seconds = max(0, (now_dt - created).total_seconds())
    return max(0, ceil((COMPLETION_SECONDS - elapsed_seconds) / 60))


def progress_percent(status):
    return round((STATUS_INDEX.get(status, 0) / (len(STATUS_FLOW) - 1)) * 100)


def iso_timestamp(value):
    if not value:
        return ""
    return parse_db_timestamp(value).strftime("%Y-%m-%dT%H:%M:%SZ")


def sqlite_timestamp(value):
    return parse_db_timestamp(value).strftime("%Y-%m-%d %H:%M:%S")


def parse_db_timestamp(value):
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)

    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1]
    text = text.replace("T", " ")

    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass

    return datetime.fromisoformat(text)
