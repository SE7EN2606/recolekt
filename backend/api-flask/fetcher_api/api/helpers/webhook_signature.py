import hashlib
import hmac
import os

from flask import Request


META_WEBHOOK_APP_SECRET_ENV = "INSTAGRAM_APP_SECRET"


def get_meta_webhook_app_secret() -> str:
    return (os.getenv(META_WEBHOOK_APP_SECRET_ENV) or "").strip()


def verify_meta_signature(request: Request, raw_body: bytes) -> tuple[bool, str]:
    app_secret = get_meta_webhook_app_secret()
    if not app_secret:
        return False, "missing_app_secret"

    signature = (request.headers.get("X-Hub-Signature-256") or "").strip()
    if not signature:
        return False, "missing_signature"

    prefix = "sha256="
    if not signature.startswith(prefix):
        return False, "malformed_signature"

    supplied_digest = signature[len(prefix):]
    if len(supplied_digest) != 64:
        return False, "malformed_signature"

    try:
        bytes.fromhex(supplied_digest)
    except ValueError:
        return False, "malformed_signature"

    expected_digest = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(supplied_digest, expected_digest):
        return False, "invalid_signature"

    return True, "ok"
