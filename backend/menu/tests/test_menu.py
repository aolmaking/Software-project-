"""
backend/menu/tests/test_menu.py

Test-Driven Prompting (TDP) unit tests for the Menu slice.
Write ALL tests first → run → confirm RED → implement routes → confirm GREEN.

Mathematical boundaries established here:
  - GET /api/menu returns ONLY items where available = 1 (TDP boundary 1)
  - GET /api/menu?category=X returns ONLY items of that category (boundary 2)
  - GET /api/menu/<bad_id> returns 404 (boundary 3)
  - price in response is always rounded to 2 decimal places (boundary 4)
  - allergens is always a list, never None (boundary 5)

Run tests with:  pytest backend/menu/tests/test_menu.py -v
"""

import pytest
import json
from backend.app import create_app
from backend.database import init_db, get_db


# ── Fixtures ───────────────────────────────────────────────
@pytest.fixture
def app():
    """Create app wired to an in-memory SQLite DB for isolation."""
    application = create_app()
    application.config.update({
        'TESTING': True,
        'DATABASE': ':memory:',
    })
    with application.app_context():
        init_db()               # load schema.sql + seed data
    yield application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def db(app):
    with app.app_context():
        yield get_db()


# ── Helpers ────────────────────────────────────────────────
def _seed_item(db, *, name='Test Latte', category='coffee',
               available=1, price=55.0, allergens='dairy'):
    """Insert a test item and return its public_id."""
    import uuid
    pub_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO items
           (public_id, name, description, price, category, available, allergens)
           VALUES (?,?,?,?,?,?,?)""",
        (pub_id, name, 'A test item.', price, category, available, allergens)
    )
    db.commit()
    return pub_id


# ══════════════════════════════════════════════════════════════
# TDP BOUNDARY 1 — Only available items in list
# Failing test written BEFORE routes.py is implemented.
# ══════════════════════════════════════════════════════════════
class TestMenuOnlyShowsAvailableItems:

    def test_unavailable_item_is_excluded_from_listing(self, client, db, app):
        """
        Mathematical boundary:
          ∀ item i in response:  i.available == True
        An item with available=0 MUST NOT appear in GET /api/menu.
        """
        with app.app_context():
            _seed_item(db, name='Ghost Cake', available=0)
            available_id = _seed_item(db, name='Real Coffee', available=1)

        res = client.get('/api/menu')
        assert res.status_code == 200

        data = json.loads(res.data)
        names = [item['name'] for item in data['items']]

        assert 'Ghost Cake' not in names, (
            "Sold-out item must not appear in GET /api/menu response"
        )
        assert 'Real Coffee' in names

    def test_all_returned_items_have_available_true(self, client, app, db):
        """Every item in the response must have available=True."""
        with app.app_context():
            _seed_item(db, name='Item A', available=1)
            _seed_item(db, name='Item B', available=0)

        res = client.get('/api/menu')
        data = json.loads(res.data)

        for item in data['items']:
            assert item['available'] is True, (
                f"Item '{item['name']}' should not be in response (available=False)"
            )


# ══════════════════════════════════════════════════════════════
# TDP BOUNDARY 2 — Category filter is exact match
# ══════════════════════════════════════════════════════════════
class TestMenuCategoryFilter:

    def test_category_filter_returns_only_matching_items(self, client, app, db):
        """
        Mathematical boundary:
          ∀ item i in response when ?category=coffee:  i.category == 'coffee'
        """
        with app.app_context():
            _seed_item(db, name='My Espresso', category='coffee')
            _seed_item(db, name='My Croissant', category='pastry')

        res = client.get('/api/menu?category=coffee')
        data = json.loads(res.data)

        categories = {item['category'] for item in data['items']}
        assert categories == {'coffee'}, (
            f"Filter returned unexpected categories: {categories}"
        )

    def test_unknown_category_returns_empty_list(self, client):
        res = client.get('/api/menu?category=nonexistent')
        data = json.loads(res.data)
        assert data['items'] == []


# ══════════════════════════════════════════════════════════════
# TDP BOUNDARY 3 — Single item 404 on unknown id
# ══════════════════════════════════════════════════════════════
class TestMenuSingleItem:

    def test_unknown_public_id_returns_404(self, client):
        res = client.get('/api/menu/definitely-not-a-real-uuid')
        assert res.status_code == 404

    def test_known_item_returns_200_with_correct_fields(self, client, app, db):
        with app.app_context():
            pub_id = _seed_item(db, name='Cardamom Latte', price=60.0,
                                allergens='dairy', category='coffee')

        res = client.get(f'/api/menu/{pub_id}')
        assert res.status_code == 200

        data = json.loads(res.data)
        assert data['name'] == 'Cardamom Latte'
        assert data['category'] == 'coffee'


# ══════════════════════════════════════════════════════════════
# TDP BOUNDARY 4 — Price is always 2 decimal places
# ══════════════════════════════════════════════════════════════
class TestMenuPriceFormat:

    def test_price_is_rounded_to_two_decimal_places(self, client, app, db):
        """
        Boundary:  ∀ item i:  str(i.price) matches /^\d+\.\d{2}$/
        Prevents floating-point leakage (e.g. 55.0000000001).
        """
        with app.app_context():
            _seed_item(db, name='Pricy Coffee', price=55.999, available=1)

        res = client.get('/api/menu')
        data = json.loads(res.data)

        for item in data['items']:
            price_str = str(item['price'])
            decimal_part = price_str.split('.')[-1] if '.' in price_str else ''
            assert len(decimal_part) <= 2, (
                f"Price {item['price']} has more than 2 decimal places"
            )


# ══════════════════════════════════════════════════════════════
# TDP BOUNDARY 5 — allergens is always a list
# ══════════════════════════════════════════════════════════════
class TestMenuAllergens:

    def test_item_with_no_allergens_returns_empty_list(self, client, app, db):
        """
        EC-07 boundary: allergens field must always be a list, even when empty.
        Never None, never a raw CSV string.
        """
        with app.app_context():
            _seed_item(db, name='Plain Espresso', allergens='', available=1)

        res = client.get('/api/menu')
        data = json.loads(res.data)

        plain = next((i for i in data['items'] if i['name'] == 'Plain Espresso'), None)
        assert plain is not None
        assert isinstance(plain['allergens'], list), (
            "allergens must be a list, not None or a string"
        )
        assert plain['allergens'] == []

    def test_item_allergens_are_split_correctly(self, client, app, db):
        """CSV 'nuts,gluten,dairy' in DB → ['nuts', 'gluten', 'dairy'] in response."""
        with app.app_context():
            pub_id = _seed_item(db, name='Almond Croissant',
                                allergens='nuts,gluten,dairy', available=1)

        res = client.get(f'/api/menu/{pub_id}')
        data = json.loads(res.data)
        assert data['allergens'] == ['nuts', 'gluten', 'dairy']


# ══════════════════════════════════════════════════════════════
# TDP BOUNDARY 6 — Response always has Content-Type: application/json
# ══════════════════════════════════════════════════════════════
class TestMenuResponseHeaders:

    def test_list_endpoint_returns_json_content_type(self, client):
        """NF-01: All API responses must declare Content-Type: application/json."""
        res = client.get('/api/menu')
        assert 'application/json' in res.content_type

    def test_not_found_also_returns_json_content_type(self, client):
        res = client.get('/api/menu/ghost-id')
        assert 'application/json' in res.content_type