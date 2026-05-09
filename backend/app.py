# backend/app.py
from flask import Flask, jsonify
from tracking.routes import tracking_bp

app = Flask(__name__)

# Register blueprints
app.register_blueprint(tracking_bp, url_prefix='/api/track')

# Basic CORS to allow frontend requests
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    app.run(debug=True, port=5000)
