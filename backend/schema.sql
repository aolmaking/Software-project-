PRAGMA foreign_keys = ON;

-- 1. MENU ITEMS (Member 1)
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

-- 2. CART (Member 2)
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    item_public_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 20),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (item_public_id) REFERENCES items(public_id) ON DELETE RESTRICT,
    UNIQUE(session_id, item_public_id)
);

-- ============================================================
-- NEW IN v2.0: CUSTOMERS (Member 4 — Authentication)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_public_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL CHECK (length(full_name) >= 1 AND length(full_name) <= 80),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS update_customers_timestamp
AFTER UPDATE ON customers
BEGIN
    UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 3. ORDERS (Member 3) — updated: customer_public_id added
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL CHECK (length(customer_name) >= 1 AND length(customer_name) <= 60),
    total REAL NOT NULL CHECK (total > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
    session_id TEXT NOT NULL,
    -- NEW in v2.0: links the order to a logged-in customer (nullable for guest orders)
    customer_public_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_public_id) REFERENCES customers(customer_public_id) ON DELETE SET NULL
);
CREATE TRIGGER IF NOT EXISTS update_orders_timestamp
AFTER UPDATE ON orders
BEGIN
    UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE INDEX IF NOT EXISTS idx_orders_session_created   ON orders(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON orders(status) WHERE status != 'completed';
-- NEW in v2.0: supports efficient customer history lookup
CREATE INDEX IF NOT EXISTS idx_orders_customer_created  ON orders(customer_public_id, created_at DESC);

-- 4. ORDER ITEMS (Member 3)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT NOT NULL,
    item_public_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),

    FOREIGN KEY (order_public_id) REFERENCES orders(order_public_id) ON DELETE CASCADE,
    FOREIGN KEY (item_public_id)  REFERENCES items(public_id)        ON DELETE RESTRICT
);

-- 5. TRACKING EVENTS (Member 5)
CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_public_id) REFERENCES orders(order_public_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tracking_events_order_time
    ON tracking_events(order_public_id, event_timestamp DESC);
