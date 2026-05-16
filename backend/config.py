# backend/config.py
import os

class Config:
    # Use environment variable in production, fallback to a secure default for dev
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-super-secret-jwt-key-2026')
    JWT_EXPIRATION_HOURS = 24
    JWT_REMEMBER_ME_DAYS = 7
