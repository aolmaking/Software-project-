# backend/app.py
from flask import Flask, jsonify, g
from tracking.routes import tracking_bp
from auth.routes import auth_bp
from order.routes import order_bp
from config import Config
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from backend.auth.routes import auth_bp
from backend.cart.routes import cart_bp
from backend.config import Config
from backend.database import close_db, init_db
from backend.menu.routes import menu_bp
from backend.tracking.routes import tracking_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per day", "50 per hour"],
        storage_uri="memory://",
    )

    limiter.limit("5 per minute")(auth_bp)

    app.register_blueprint(menu_bp)
    app.register_blueprint(cart_bp)
    app.register_blueprint(tracking_bp, url_prefix="/api/track")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    app.teardown_appcontext(close_db)

    @app.teardown_appcontext
    def teardown_db(exception):
        db = getattr(g, "db", None)
        if db is not None:
            db.close()

# Apply rate limiting specifically to auth endpoints
limiter.limit("5 per minute")(auth_bp)

# Register Blueprints
app.register_blueprint(tracking_bp, url_prefix='/api/track')
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(order_bp, url_prefix='/api/order')

# Secure CORS handling
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        print("Database initialised.")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=False, port=5000, use_reloader=False)