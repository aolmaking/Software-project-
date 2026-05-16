import os

from flask import Flask, jsonify, redirect, request

from backend.auth.routes import auth_bp
from backend.cart.routes import cart_bp
from backend.config import Config
from backend.database import close_db, init_db
from backend.menu.routes import menu_bp
from backend.order.routes import order_bp
from backend.order.status_routes import status_bp
from backend.tracking.routes import tracking_bp


def create_app(static_folder=None, static_url_path=""):
    if static_folder is None:
        static_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

    app = Flask(__name__, static_folder=static_folder, static_url_path=static_url_path)
    app.config.from_object(Config)

    app.register_blueprint(menu_bp)
    app.register_blueprint(cart_bp)
    app.register_blueprint(tracking_bp, url_prefix="/api/track")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(order_bp, url_prefix="/api/order")
    app.register_blueprint(status_bp, url_prefix="/api/status")

    @app.after_request
    def after_request(response):
        origin = request.headers.get("Origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        return response

    @app.teardown_appcontext
    def teardown_db(exception):
        close_db(exception)

    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found", "code": "NOT_FOUND"}), 404
        return error

    @app.errorhandler(405)
    def method_not_allowed(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Method not allowed", "code": "METHOD_NOT_ALLOWED"}), 405
        return error

    @app.errorhandler(500)
    def server_error(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Internal server error", "code": "SERVER_ERROR"}), 500
        return error

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        print("Database initialised.")

    @app.route("/")
    def index():
        return redirect("/login.html")

    return app



app = create_app()


if __name__ == "__main__":
    app.run(debug=False, port=5000, use_reloader=False)
