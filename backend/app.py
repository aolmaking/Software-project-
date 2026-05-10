from flask import Flask
from flask_cors import CORS
from backend.database import init_db
from backend.menu.routes import menu_bp

def create_app():
    app = Flask(__name__)

    # Allow the frontend (served from file:// or a local dev server)
    # to call the API without CORS errors during development.
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints — each member adds their own here
    app.register_blueprint(menu_bp)
    # app.register_blueprint(cart_bp)       ← Member 2 adds this
    # app.register_blueprint(order_bp)      ← Member 3 adds this
    # app.register_blueprint(auth_bp)       ← Member 4 adds this
    # app.register_blueprint(tracking_bp)   ← Member 5 adds this

    # CLI command: flask init-db
    @app.cli.command('init-db')
    def init_db_command():
        init_db()
        print('Database initialised.')

    return app

# Run directly with: python -m backend.app  (dev only)
if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)