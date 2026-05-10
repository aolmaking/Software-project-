"""
tracking/models.py
==================
Data classes that mirror schemas in contracts/tracking.yaml.
Member 5 owns this file.
"""

from dataclasses import dataclass


@dataclass
class TrackingResponse:
    """
    Mirrors TrackingResponse schema in contracts/tracking.yaml.

    IMPORTANT: Do NOT include customer_name or item breakdown here.
    The contract explicitly forbids exposing PII to anonymous callers (EC-05).
    """
    order_id: str
    status: str                  # one of: pending, preparing, ready, completed
    last_updated: str            # ISO 8601 UTC timestamp (F-TRK-04)
    estimated_wait_minutes: int  # ETA = 5 + (N_pending × 3) (F-TRK-05)

    def to_dict(self) -> dict:
        return {
            "order_id": self.order_id,
            "status": self.status,
            "last_updated": self.last_updated,
            "estimated_wait_minutes": self.estimated_wait_minutes,
        }


def calculate_eta(n_pending: int) -> int:
    """ETA formula from F-TRK-05: base_time=5 + (N_pending × 3)."""
    return 5 + (n_pending * 3)
