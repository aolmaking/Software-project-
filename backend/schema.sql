PRAGMA foreign_keys = ON;

-- ============================================
-- 1. MENU ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE NOT NULL
        CHECK (length(public_id) = 36),
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

-- ============================================
-- 2. CUSTOMERS (AUTH)
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_public_id TEXT UNIQUE NOT NULL
        CHECK (length(customer_public_id) = 36),
    email TEXT UNIQUE NOT NULL COLLATE NOCASE
        CHECK (email LIKE '%@%.%'),
    username TEXT UNIQUE NOT NULL COLLATE NOCASE
        CHECK (length(username) >= 3),
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL
        CHECK (length(full_name) >= 1 AND length(full_name) <= 80),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS update_customers_timestamp
AFTER UPDATE ON customers
BEGIN
    UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_customers_email
ON customers(email);

-- ============================================
-- 3. CART (SESSION-BASED)
-- ============================================

CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    item_public_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 20),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_public_id)
        REFERENCES items(public_id)
        ON DELETE RESTRICT,
    UNIQUE(session_id, item_public_id)
);

-- ============================================
-- 4. ORDERS (NO GUEST ORDERS)
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT UNIQUE NOT NULL
        CHECK (length(order_public_id) = 36),
    customer_public_id TEXT NOT NULL,
    customer_name TEXT NOT NULL
        CHECK (length(customer_name) >= 1 AND length(customer_name) <= 60),
    total REAL NOT NULL CHECK (total > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
    session_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_public_id)
        REFERENCES customers(customer_public_id)
        ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS update_orders_timestamp
AFTER UPDATE ON orders
BEGIN
    UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_orders_session_created
ON orders(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status) WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_orders_customer_created
ON orders(customer_public_id, created_at DESC);

-- ============================================
-- 5. ORDER ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT NOT NULL,
    item_public_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    FOREIGN KEY (order_public_id)
        REFERENCES orders(order_public_id)
        ON DELETE CASCADE,
    FOREIGN KEY (item_public_id)
        REFERENCES items(public_id)
        ON DELETE RESTRICT
);

-- ============================================
-- 6. TRACKING EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_public_id TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_public_id)
        REFERENCES orders(order_public_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_order_time
ON tracking_events(order_public_id, event_timestamp DESC);

-- ============================================
-- DEV SEED DATA
-- ============================================

INSERT OR IGNORE INTO items
    (public_id, name, description, price, category, available, allergens, image_url)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'Flat white', 'Double ristretto, steamed whole milk, microfoam crown.', 55.00, 'coffee', 1, 'dairy', 'images/Flat_white.jpg'),
    ('22222222-2222-4222-8222-222222222222', 'Cardamom latte', 'House-spiced espresso with warm steamed milk.', 60.00, 'coffee', 1, 'dairy', 'images/cardamom_latte.jfif'),
    ('33333333-3333-4333-8333-333333333333', 'Turkish coffee', 'Finely ground, slow-brewed in a cezve. With lokum.', 45.00, 'coffee', 1, '', 'images/Turkish_coffee.jpeg'),
    ('44444444-4444-4444-8444-444444444444', 'Cold brew', '18-hour steep, served over hand-cut ice.', 65.00, 'cold', 1, '', 'images/Cold_brew.jfif'),
    ('55555555-5555-4555-8555-555555555555', 'Rose lemonade', 'Fresh lemon, rose syrup, sparkling water.', 50.00, 'cold', 1, '', 'images/Rose_lemonade.jfif'),
    ('66666666-6666-4666-8666-666666666666', 'Almond croissant', 'Twice-baked with frangipane and toasted almonds.', 55.00, 'pastry', 1, 'gluten,nuts,dairy,eggs', 'images/Almond_croissant.jfif'),
    ('77777777-7777-4777-8777-777777777777', 'Pistachio knot', 'Enriched dough, pistachio cream, honey glaze.', 50.00, 'pastry', 1, 'gluten,nuts,dairy,eggs', 'images/Pistachio_knot.jfif'),
    ('88888888-8888-4888-8888-888888888888', 'Seasonal tart', 'Rotating fruit tart with creme patissiere.', 70.00, 'seasonal', 0, 'gluten,dairy,eggs', 'images/Seasonal_tart.jfif'),
    ('99999999-9999-4999-8999-999999999999', 'Saffron milk cake', 'Tres leches soaked with saffron and cardamom.', 75.00, 'seasonal', 1, 'gluten,dairy,eggs', 'images/Saffron_milk_cake.jfif'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Iced matcha', 'Ceremonial grade matcha, oat milk, cane syrup.', 65.00, 'cold', 1, '', 'images/Iced_matcha.jpg'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Espresso', 'Single or double origin. Ask your barista.', 35.00, 'coffee', 1, '', 'images/espresso.webp'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Pain au chocolat', 'Belgian dark chocolate, butter-laminated dough.', 48.00, 'pastry', 1, 'gluten,dairy,eggs', 'images/Pain_au_chocolat.jpg');
