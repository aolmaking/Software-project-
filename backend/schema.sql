PRAGMA foreign_keys = ON;


--1. MENU ITEMS (Member 1):

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL CHECK (price >= 0),
    category TEXT NOT NULL,
    available BOOLEAN NOT NULL DEFAULT 1,
    allergens TEXT,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS update_items_timestamp 
AFTER UPDATE ON items
BEGIN
    UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

--2. CART (Member 2):

CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    item_public_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 20),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_public_id) REFERENCES items(public_id),
    UNIQUE(session_id, item_public_id)
);

-- 3. ORDERS (Member 3):

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL CHECK (length(customer_name) >= 1 AND length(customer_name) <= 60),
    total REAL NOT NULL CHECK (total > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
    session_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_session_created ON orders(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status) WHERE status != 'completed';

-- 4. ORDER ITEMS (Member 3: Order Placement):

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT NOT NULL,
    item_public_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    
    FOREIGN KEY (order_public_id) REFERENCES orders(order_public_id) ON DELETE CASCADE,
    FOREIGN KEY (item_public_id) REFERENCES items(public_id) ON DELETE RESTRICT
);

-- 5. TRACKING EVENTS (Member 5):

CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_public_id) REFERENCES orders(order_public_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_order_time ON tracking_events(order_public_id, event_timestamp DESC);


-- INSERT INTO items (public_id, name, description, price, category, available, allergens) VALUES
-- ('550e8400-e29b-41d4-a716-446655440000', 'Caramel Latte', 'Espresso with steamed milk and caramel', 85.00, 'Coffee', 1, 'dairy'),
-- ('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Almond Croissant', 'Buttery croissant with almond filling', 55.00, 'Pastries', 1, 'nuts,gluten,dairy'),
-- ('e4367ad1-2ad5-4501-a6f6-490792376189', 'Chocolate Cake', 'Rich chocolate layer cake', 75.00, 'Pastries', 0, 'gluten,dairy');