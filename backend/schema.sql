-- ═══════════════════════════════════════════════════════════════════
--  schema.sql  —  Saofa Coffee & Bakery  |  Customer Ordering System
--  Run once via:  flask init-db   (see database.py)
-- ═══════════════════════════════════════════════════════════════════
PRAGMA journal_mode = WAL;   -- better concurrency (NF-04)
PRAGMA foreign_keys = ON;    -- enforce FK constraints

-- ───────────────────────────────────────────────────────────────────
-- 1. CUSTOMERS  (Member 4 — Auth slice)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    public_id     TEXT     NOT NULL UNIQUE,          -- UUID v4
    username      TEXT     NOT NULL UNIQUE,
    email         TEXT     NOT NULL UNIQUE,
    full_name     TEXT     NOT NULL,
    password_hash TEXT     NOT NULL,                 -- bcrypt via werkzeug
    created_at    TEXT     NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
-- ───────────────────────────────────────────────────────────────────
-- 2. ITEMS  (Member 1 — Menu slice)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    public_id   TEXT     NOT NULL UNIQUE,            -- UUID v4 (F-MNU-06)
    name        TEXT     NOT NULL,
    description TEXT     NOT NULL DEFAULT '',
    price       REAL     NOT NULL CHECK(price > 0),
    category    TEXT     NOT NULL CHECK(category IN ('coffee','pastry','cold','seasonal')),
    available   INTEGER  NOT NULL DEFAULT 1 CHECK(available IN (0, 1)),
    allergens   TEXT     NOT NULL DEFAULT '',
    image_url   TEXT     -- <-- This is the line we needed to add!
);
CREATE INDEX IF NOT EXISTS idx_items_category  ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_available ON items(available);

-- ───────────────────────────────────────────────────────────────────
-- 3. CART  (Member 2 — Cart slice)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT     NOT NULL,
    item_id     INTEGER  NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity    INTEGER  NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 20),
    added_at    TEXT     NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_session ON cart(session_id);

-- ───────────────────────────────────────────────────────────────────
-- 4. ORDERS  (Member 3 — Order Placement slice)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id               INTEGER  PRIMARY KEY AUTOINCREMENT,
    public_id        TEXT     NOT NULL UNIQUE,
    session_id       TEXT     NOT NULL,
    customer_id      INTEGER  REFERENCES customers(id) ON DELETE SET NULL,
    customer_name    TEXT     NOT NULL,
    total            REAL     NOT NULL CHECK(total >= 0),
    status           TEXT     NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','completed')),
    created_at       TEXT     NOT NULL DEFAULT (datetime('now')),
    idempotency_key  TEXT     NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_orders_session    ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer   ON orders(customer_id);

-- ───────────────────────────────────────────────────────────────────
-- 5. ORDER ITEMS  (Members 3 & 4)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id     INTEGER  NOT NULL REFERENCES items(id),
    item_name   TEXT     NOT NULL,
    quantity    INTEGER  NOT NULL CHECK(quantity >= 1),
    unit_price  REAL     NOT NULL CHECK(unit_price > 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ───────────────────────────────────────────────────────────────────
-- 6. TRACKING EVENTS  (Member 5 — Tracking slice)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_events (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      TEXT     NOT NULL,
    updated_by  TEXT     NOT NULL DEFAULT 'system',
    created_at  TEXT     NOT NULL DEFAULT (datetime('now','utc'))
);
CREATE INDEX IF NOT EXISTS idx_tracking_order ON tracking_events(order_id);

-- ───────────────────────────────────────────────────────────────────
-- 7. SEED DATA  (dev only — delete before production)
-- ───────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (public_id, name, description, price, category, available, allergens, image_url) VALUES  
('uid-001','Flat white',       'Double ristretto, steamed whole milk, microfoam crown.',55.00,'coffee',1,'dairy', 'images/Flat_white.jpg'),  
('uid-002','Cardamom latte',   'House-spiced espresso with warm steamed milk.',         60.00,'coffee',1,'dairy', 'images/cardamom_latte.jfif'),  
('uid-003','Turkish coffee',   'Finely ground, slow-brewed in a cezve. With lokum.',   45.00,'coffee',1,'', 'images/Turkish_coffee.jpeg'),  
('uid-004','Cold brew',        '18-hour steep, served over hand-cut ice.',              65.00,'cold',  1,'', 'images/Cold_brew.jfif'),  
('uid-005','Rose lemonade',    'Fresh lemon, rose syrup, sparkling water.',             50.00,'cold',  1,'', 'images/Rose_lemonade.jfif'),  
('uid-006','Almond croissant', 'Twice-baked with frangipane, toasted almonds.',        55.00,'pastry',1,'gluten,nuts,dairy,eggs', 'images/Almond_croissant.jfif'),  
('uid-007','Pistachio knot',   'Enriched dough, pistachio cream, honey glaze.',        50.00,'pastry',1,'gluten,nuts,dairy,eggs', 'images/Pistachio_knot.jfif'),  
('uid-008','Seasonal tart',    'Rotating fruit tart with crème pâtissière.',           70.00,'seasonal',0,'gluten,dairy,eggs', 'images/Seasonal_tart.jfif'),  
('uid-009','Saffron milk cake','Tres leches soaked with saffron & cardamom.',          75.00,'seasonal',1,'gluten,dairy,eggs', 'images/Saffron_milk_cake.jfif'),  
('uid-010','Iced matcha',      'Ceremonial grade matcha, oat milk, cane syrup.',       65.00,'cold',  1,'', 'images/Iced_matcha.jpg'),  
('uid-011','Espresso',         'Single or double origin. Ask your barista.',           35.00,'coffee',1,'', 'images/espresso.webp'),  
('uid-012','Pain au chocolat', 'Belgian dark chocolate, butter-laminated dough.',      48.00,'pastry',1,'gluten,dairy,eggs', 'images/Pain_au_chocolat.jpg');