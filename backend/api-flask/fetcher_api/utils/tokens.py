import secrets
import hashlib

def generate_api_token():
    """Generate a secure API token like rk_live_xxxxx"""
    random_part = secrets.token_urlsafe(32)  # 32 bytes = ~43 chars
    token = f"rk_live_{random_part}"
    return token

def hash_token(token: str) -> str:
    """Hash token for secure storage (SHA-256)"""
    return hashlib.sha256(token.encode()).hexdigest()

def get_token_prefix(token: str) -> str:
    """Get first 12 chars for display (e.g., rk_live_AbCd...)"""
    return token[:12] + "..." if len(token) > 12 else token
