"""
cart/models.py
==============
Data classes that mirror the Cart schemas in contracts/cart.yaml.
Member 2 owns this file.
"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class CartItem:
    """Mirrors CartItem schema in contracts/cart.yaml."""
    item_id: str        # UUID of the menu item
    name: str
    price: float        # live price at render time (EC-02)
    quantity: int       # must be in [1, 20] (F-CRT-05)

    @property
    def subtotal(self) -> float:
        """price × quantity, rounded to 2 decimal places (F-CRT-04)."""
        return round(self.price * self.quantity, 2)

    def to_dict(self) -> dict:
        return {
            "item_id": self.item_id,
            "name": self.name,
            "price": round(self.price, 2),
            "quantity": self.quantity,
            "subtotal": self.subtotal,
        }


@dataclass
class CartResponse:
    """Mirrors CartResponse schema in contracts/cart.yaml."""
    items: List[CartItem] = field(default_factory=list)

    @property
    def total(self) -> float:
        return round(sum(i.subtotal for i in self.items), 2)

    def to_dict(self) -> dict:
        return {
            "items": [i.to_dict() for i in self.items],
            "total": self.total,
        }
