from flask import Flask
from flask_cors import CORS

from backend.cart.routes import cart_bp
from backend.database import close_db, init_db
from backend.menu.routes import menu_bp


def create_app():
    app = Flask(__name__)

    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    app.register_blueprint(menu_bp)
    app.register_blueprint(cart_bp)
    app.teardown_appcontext(close_db)

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        print("Database initialised.")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=False, port=5000, use_reloader=False)
