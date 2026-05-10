# backend/app.py
from flask import Flask, jsonify, g
from tracking.routes import tracking_bp
from auth.routes import auth_bp
from config import Config
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask(__name__)
app.config.from_object(Config)

# Rate Limiter setup (memory-based)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

@app.teardown_appcontext
def teardown_db(exception):
    # Safely closes the database connection when request context ends
    db = getattr(g, 'db', None)
    if db is not None:
        db.close()

# Apply rate limiting specifically to auth endpoints
limiter.limit("5 per minute")(auth_bp)

# Register Blueprints
app.register_blueprint(tracking_bp, url_prefix='/api/track')
app.register_blueprint(auth_bp, url_prefix='/api/auth')

# Secure CORS handling
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    app.run(debug=True, port=5000)
