import sqlite3
import os
from flask import g

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'saofa.db')
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'schema.sql')

def get_db():
    """
    Returns the per-request DB connection stored in Flask's g object.
    Uses row_factory so columns are accessible by name:  row['price']
    """
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db

def close_db(e=None):
    """Teardown function — close DB at end of request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    """Drop and recreate all tables from schema.sql.  Dev only."""
    db = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        db.executescript(f.read())
    db.commit()
    db.close()