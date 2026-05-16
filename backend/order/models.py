"""
order/models.py
===============
Data classes that mirror schemas in contracts/order.yaml.
Member 3 owns this file.
"""

import re
import uuid
from dataclasses import dataclass


# Regex from contract (F-ORD-06, EC-03): Unicode letters, spaces,
# apostrophes, hyphens, and dots only.
NAME_PATTERN = re.compile(r"^(?:[^\W\d_]|\s|'|-|\.){1,60}$", re.UNICODE)


@dataclass
class PlaceOrderRequest:
    """Mirrors PlaceOrderRequest schema in contracts/order.yaml."""
    customer_name: str

    def validate(self) -> None:
        """Raise ValueError if customer_name fails contract validation."""
        if not self.customer_name or not NAME_PATTERN.match(self.customer_name):
            raise ValueError("Customer name contains invalid characters")

    @staticmethod
    def from_json(data: dict) -> "PlaceOrderRequest":
        return PlaceOrderRequest(customer_name=data.get("customer_name", ""))


@dataclass
class PlaceOrderResponse:
    """Mirrors PlaceOrderResponse schema in contracts/order.yaml."""
    order_id: str
    status: str = "pending"   # always "pending" at placement (F-ORD-05)
    total: float = 0.0

    def to_dict(self) -> dict:
        return {
            "order_id": self.order_id,
            "status": self.status,
            "total": round(self.total, 2),
        }


def generate_order_id() -> str:
    """UUID v4 for new orders (EC-05 — never a sequential integer)."""
    return str(uuid.uuid4())
