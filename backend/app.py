# backend/app.py
from flask import Flask, jsonify
from tracking.routes import tracking_bp
from auth import auth_bp
from database import init_db, close_db
from config import Config
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask(__name__)
app.config.from_object(Config)

# Initialize database
init_db(app)

# Initialize Rate Limiter
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

@app.teardown_appcontext
def teardown_db(exception):
    close_db(exception)

# Register blueprints
app.register_blueprint(tracking_bp, url_prefix='/api/track')
# Rate limit all auth routes
limiter.limit("5 per minute")(auth_bp)
app.register_blueprint(auth_bp)

# Basic CORS to allow frontend requests
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    app.run(debug=True, port=5000)
