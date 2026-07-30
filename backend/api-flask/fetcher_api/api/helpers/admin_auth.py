import hmac
import os

from flask import Request


def get_configured_admin_key() -> str:
    return (os.getenv("ADMIN_KEY") or os.getenv("ADMIN_SECRET") or "").strip()


def get_supplied_admin_key(request: Request) -> str:
    return (request.args.get("key") or request.headers.get("X-Admin-Key") or "").strip()


def is_admin_key_valid(supplied_key: str) -> bool:
    configured_key = get_configured_admin_key()
    if not configured_key or not supplied_key:
        return False
    return hmac.compare_digest(supplied_key, configured_key)
