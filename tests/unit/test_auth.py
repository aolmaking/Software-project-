import pytest
from app import app
from database import get_db, init_db
import json

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['DATABASE'] = ':memory:'
    
    with app.test_client() as client:
        with app.app_context():
            init_db(app)
        yield client

def test_register_success(client):
    response = client.post('/api/auth/register', json={
        "email": "test@example.com",
        "username": "tester",
        "password": "StrongPassword123!",
        "full_name": "Test User"
    })
    assert response.status_code == 201
    assert 'token' in response.get_json()

def test_register_duplicate_email(client):
    payload = {
        "email": "test@example.com",
        "username": "tester",
        "password": "StrongPassword123!",
        "full_name": "Test User"
    }
    client.post('/api/auth/register', json=payload)
    
    # Try duplicate email with different username
    payload['username'] = "tester2"
    response = client.post('/api/auth/register', json=payload)
    assert response.status_code == 409
    assert response.get_json()['code'] == 'DUPLICATE_RESOURCE'

def test_register_weak_password(client):
    # Test missing numbers
    response = client.post('/api/auth/register', json={
        "email": "test@example.com",
        "username": "tester",
        "password": "onlyletters",
        "full_name": "Test User"
    })
    assert response.status_code == 400
    assert response.get_json()['code'] == 'VALIDATION_ERROR'
    
    # Test missing letters
    response2 = client.post('/api/auth/register', json={
        "email": "test@example.com",
        "username": "tester",
        "password": "1234567890",
        "full_name": "Test User"
    })
    assert response2.status_code == 400
    assert response2.get_json()['code'] == 'VALIDATION_ERROR'

    # Test spaces
    response3 = client.post('/api/auth/register', json={
        "email": "test@example.com",
        "username": "tester",
        "password": "pass word123",
        "full_name": "Test User"
    })
    assert response3.status_code == 400
    assert response3.get_json()['code'] == 'VALIDATION_ERROR'

def test_login_success(client):
    # Register first
    client.post('/api/auth/register', json={
        "email": "test2@example.com",
        "username": "tester2",
        "password": "StrongPassword123!",
        "full_name": "Test User 2"
    })
    
    # Login
    response = client.post('/api/auth/login', json={
        "email": "test2@example.com",
        "password": "StrongPassword123!"
    })
    assert response.status_code == 200
    assert 'token' in response.get_json()

def test_login_invalid_credentials(client):
    # Register first
    client.post('/api/auth/register', json={
        "email": "test3@example.com",
        "username": "tester3",
        "password": "StrongPassword123!",
        "full_name": "Test User 3"
    })
    
    # Login with wrong password
    response = client.post('/api/auth/login', json={
        "email": "test3@example.com",
        "password": "WrongPassword123!"
    })
    assert response.status_code == 401
    assert response.get_json()['code'] == 'INVALID_CREDENTIALS'

def test_protected_me_route(client):
    # Register and get token
    reg_response = client.post('/api/auth/register', json={
        "email": "test4@example.com",
        "username": "tester4",
        "password": "StrongPassword123!",
        "full_name": "Test User 4"
    })
    token = reg_response.get_json()['token']
    
    # Access protected route
    response = client.get('/api/auth/me', headers={
        'Authorization': f'Bearer {token}'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert data['email'] == 'test4@example.com'
    assert data['username'] == 'tester4'

def test_protected_route_no_token(client):
    response = client.get('/api/auth/me')
    assert response.status_code == 401
    assert response.get_json()['code'] == 'UNAUTHORIZED'
