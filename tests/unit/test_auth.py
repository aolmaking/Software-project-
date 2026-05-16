import sys
import os
import unittest
import json
import sqlite3

# Ensure the backend module is loaded correctly
sys.path.insert(0, os.path.abspath('backend'))
from app import app

class AuthTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        
        self.test_email = "securetest_unittest@example.com"
        self.test_username = "securetestuser"
        self.test_password = "Password123"

    def tearDown(self):
        # Cleanup test user
        db_path = os.path.abspath('backend/Database.db')
        conn = sqlite3.connect(db_path)
        conn.execute("DELETE FROM customers WHERE email = ?", (self.test_email,))
        conn.commit()
        conn.close()

    def test_1_register_success(self):
        res = self.app.post('/api/auth/register', json={
            "email": self.test_email,
            "username": self.test_username,
            "password": self.test_password,
            "full_name": self.test_username
        })
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(data.get('message'), 'Registration successful')

    def test_2_register_duplicate(self):
        # Insert once
        self.app.post('/api/auth/register', json={
            "email": self.test_email,
            "username": self.test_username,
            "password": self.test_password,
            "full_name": self.test_username
        })
        # Insert twice
        res = self.app.post('/api/auth/register', json={
            "email": self.test_email,
            "username": self.test_username,
            "password": self.test_password,
            "full_name": self.test_username
        })
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(data.get('code'), 'DUPLICATE_RESOURCE')

    def test_3_login_success(self):
        self.app.post('/api/auth/register', json={
            "email": self.test_email,
            "username": self.test_username,
            "password": self.test_password,
            "full_name": self.test_username
        })
        res = self.app.post('/api/auth/login', json={
            "email": self.test_email,
            "password": self.test_password,
            "remember_me": True
        })
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertIn('token', data)

    def test_4_login_invalid(self):
        res = self.app.post('/api/auth/login', json={
            "email": "wrong@example.com",
            "password": "WrongPassword1"
        })
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 401)
        self.assertEqual(data.get('code'), 'INVALID_CREDENTIALS')
        
    def test_5_password_complexity(self):
        # Missing number
        res = self.app.post('/api/auth/register', json={
            "email": "badpass@example.com",
            "username": "badpassuser",
            "password": "Password",
            "full_name": "badpassuser"
        })
        self.assertEqual(res.status_code, 400)

if __name__ == '__main__':
    unittest.main()
