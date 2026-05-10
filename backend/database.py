import sqlite3
import os
from flask import g

DATABASE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database.db')
SCHEMA = os.path.join(os.path.dirname(__file__), 'schema.sql')

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        
        # Enforce foreign keys in SQLite
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db

def init_db(app):
    with app.app_context():
        db = get_db()
        with open(SCHEMA, 'r') as f:
            db.executescript(f.read())
        db.commit()

def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()
