import base64
import hashlib
import hmac
import json
import time


class TokenError(Exception):
    """Raised when an auth token cannot be decoded or verified."""


class TokenExpired(TokenError):
    """Raised when an auth token is structurally valid but expired."""


def create_token(customer_id, secret_key, expires_in_seconds):
    now = int(time.time())
    payload = {
        "customer_id": customer_id,
        "iat": now,
        "exp": now + int(expires_in_seconds),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_part = _b64encode(payload_bytes)
    signature_part = _sign(payload_part, secret_key)
    return f"{payload_part}.{signature_part}"


def decode_token(token, secret_key):
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise TokenError("Invalid token") from exc

    expected_signature = _sign(payload_part, secret_key)
    if not hmac.compare_digest(signature_part, expected_signature):
        raise TokenError("Invalid token")

    try:
        payload = json.loads(_b64decode(payload_part))
    except (ValueError, json.JSONDecodeError) as exc:
        raise TokenError("Invalid token") from exc

    if int(payload.get("exp", 0)) < int(time.time()):
        raise TokenExpired("Token has expired")

    return payload


def _sign(payload_part, secret_key):
    digest = hmac.new(
        str(secret_key).encode("utf-8"),
        payload_part.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64encode(digest)


def _b64encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
