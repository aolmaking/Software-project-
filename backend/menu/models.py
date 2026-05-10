"""
menu/models.py
==============
Data classes that mirror the MenuItem schema in contracts/menu.yaml.

RULE: Every field name and type here must match the contract exactly.
      If the contract changes, this file changes first.

Member 1 owns this file.
"""

from dataclasses import dataclass, field
from typing import List, Optional
import uuid


# Allowed allergen tags — matches enum in menu.yaml
VALID_ALLERGENS = {"nuts", "gluten", "dairy", "eggs", "soy", "shellfish"}


@dataclass
class MenuItem:
    """
    Mirrors the MenuItem schema in contracts/menu.yaml.

    Fields
    ------
    id          : UUID v4 string — NEVER a sequential integer (F-MNU-06)
    name        : Display name, 1–100 chars
    category    : Grouping label, e.g. "Coffee", "Pastries" (F-MNU-01)
    price       : Price in EGP, 2 decimal places (F-MNU-02)
    description : Short description, max 300 chars (F-MNU-02)
    available   : False = sold out; disables Add-to-Cart (F-MNU-04)
    allergens   : List of allergen tags from VALID_ALLERGENS (EC-07)
    """
    id: str
    name: str
    category: str
    price: float
    description: str
    available: bool
    allergens: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """
        Serialize to a dict that matches the contract's MenuItem schema exactly.
        Used by routes.py before jsonify().
        """
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "price": round(self.price, 2),   # always 2 decimal places (F-MNU-02)
            "description": self.description,
            "available": self.available,
            "allergens": self.allergens,
        }

    @staticmethod
    def from_db_row(row: dict) -> "MenuItem":
        """
        Convert a SQLite row (from database.py) into a MenuItem.
        The DB stores allergens as a comma-separated string; we split here.
        """
        allergens_raw = row.get("allergens") or ""
        allergens = [a.strip() for a in allergens_raw.split(",") if a.strip()]
        return MenuItem(
            id=row["id"],
            name=row["name"],
            category=row["category"],
            price=float(row["price"]),
            description=row.get("description", ""),
            available=bool(row["available"]),
            allergens=allergens,
        )


@dataclass
class MenuListResponse:
    """
    Mirrors the MenuListResponse schema in contracts/menu.yaml.
    Wraps a list of MenuItems.
    """
    items: List[MenuItem]

    def to_dict(self) -> dict:
        return {"items": [item.to_dict() for item in self.items]}


def generate_item_id() -> str:
    """Generate a UUID v4 for a new menu item (F-MNU-06)."""
    return str(uuid.uuid4())
