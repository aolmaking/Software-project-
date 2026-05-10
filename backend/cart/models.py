# backend/cart/models.py

class CartItem:
    """
    Represents a single item inside the shopping cart.
    """

    def __init__(self, item_id, name, price, quantity):
        self.item_id = item_id
        self.name = name
        self.price = price
        self.quantity = quantity
        self.subtotal = price * quantity

    def update_quantity(self, new_quantity):
        """
        Update item quantity and recalculate subtotal.
        """
        self.quantity = new_quantity
        self.subtotal = self.price * self.quantity

    def to_dict(self):
        """
        Convert CartItem object into dictionary format.
        """
        return {
            "item_id": self.item_id,
            "name": self.name,
            "price": self.price,
            "quantity": self.quantity,
            "subtotal": self.subtotal
        }


class CartResponse:
    """
    Represents the full shopping cart response.
    """

    def __init__(self, items):
        self.items = items
        self.total = self.calculate_total()

    def calculate_total(self):
        """
        Calculate total price of all cart items.
        """
        return sum(item.subtotal for item in self.items)

    def to_dict(self):
        """
        Convert CartResponse object into dictionary format.
        """
        return {
            "items": [item.to_dict() for item in self.items],
            "total": self.total
        }