import re
import uuid
import datetime
import jwt
from functools import wraps
from flask import Blueprint, request, jsonify, current_app, g
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from database import get_db
from . import auth_bp

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing or invalid Authorization header", "code": "UNAUTHORIZED"}), 401
        
        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
            db = get_db()
            user = db.execute('SELECT * FROM customers WHERE customer_public_id = ?', (payload['customer_id'],)).fetchone()
            if not user:
                return jsonify({"error": "User not found", "code": "UNAUTHORIZED"}), 401
            g.user = user
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired", "code": "TOKEN_EXPIRED"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token", "code": "INVALID_TOKEN"}), 401
            
        return f(*args, **kwargs)
    return decorated

def validate_password(password):
    if len(password) < 8 or len(password) > 128:
        return False
    if ' ' in password:
        return False
    if not re.search(r"[a-zA-Z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    return True

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload", "code": "INVALID_INPUT"}), 400
        
    email = data.get('email', '').strip()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip()
    
    # Validation
    if not email or not username or not password or not full_name:
        return jsonify({"error": "All fields are required", "code": "VALIDATION_ERROR"}), 400
    if len(username) < 3 or len(username) > 30:
        return jsonify({"error": "Username must be between 3 and 30 characters", "code": "VALIDATION_ERROR"}), 400
    if len(email) > 255 or not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return jsonify({"error": "Invalid email format", "code": "VALIDATION_ERROR"}), 400
    if not validate_password(password):
        return jsonify({"error": "Password must contain at least 8 characters, including one letter and one number.", "code": "VALIDATION_ERROR"}), 400
    if len(full_name) < 1 or len(full_name) > 80:
        return jsonify({"error": "Full name must be between 1 and 80 characters", "code": "VALIDATION_ERROR"}), 400
        
    db = get_db()
    customer_public_id = str(uuid.uuid4())
    password_hash = generate_password_hash(password)
    
    try:
        db.execute(
            'INSERT INTO customers (customer_public_id, email, username, password_hash, full_name) VALUES (?, ?, ?, ?, ?)',
            (customer_public_id, email, username, password_hash, full_name)
        )
        db.commit()
    except sqlite3.IntegrityError as e:
        error_msg = str(e).lower()
        if 'email' in error_msg:
            return jsonify({"error": "Email is already registered", "code": "DUPLICATE_RESOURCE"}), 409
        elif 'username' in error_msg:
            return jsonify({"error": "Username is already taken", "code": "DUPLICATE_RESOURCE"}), 409
        return jsonify({"error": "Duplicate resource", "code": "DUPLICATE_RESOURCE"}), 409

    # Generate token
    exp_hours = current_app.config.get('JWT_EXPIRATION_HOURS', 24)
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=exp_hours)
    token = jwt.encode({
        'customer_id': customer_public_id,
        'exp': exp,
        'iat': datetime.datetime.now(datetime.timezone.utc)
    }, current_app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({"token": token}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload", "code": "INVALID_INPUT"}), 400
        
    email = data.get('email', '').strip()
    password = data.get('password', '')
    remember_me = data.get('remember_me', False)
    
    if not email or not password or len(email) > 255 or len(password) > 128:
        return jsonify({"error": "Email and password are required and must be valid", "code": "VALIDATION_ERROR"}), 400

    db = get_db()
    user = db.execute('SELECT * FROM customers WHERE email = ? COLLATE NOCASE', (email,)).fetchone()
    
    if user is None or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Invalid email or password", "code": "INVALID_CREDENTIALS"}), 401

    if remember_me:
        exp_days = current_app.config.get('JWT_REMEMBER_ME_DAYS', 7)
        exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=exp_days)
    else:
        exp_hours = current_app.config.get('JWT_EXPIRATION_HOURS', 24)
        exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=exp_hours)

    token = jwt.encode({
        'customer_id': user['customer_public_id'],
        'exp': exp,
        'iat': datetime.datetime.now(datetime.timezone.utc)
    }, current_app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({"token": token}), 200

@auth_bp.route('/me', methods=['GET'])
@require_auth
def me():
    return jsonify({
        "customer_public_id": g.user['customer_public_id'],
        "email": g.user['email'],
        "username": g.user['username'],
        "full_name": g.user['full_name']
    }), 200
