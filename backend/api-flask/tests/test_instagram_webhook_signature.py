import hashlib
import hmac
import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask

WEBHOOK_ROUTE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fetcher_api"
    / "api"
    / "routes"
    / "webhook.py"
)
spec = importlib.util.spec_from_file_location("webhook_routes_for_test", WEBHOOK_ROUTE_PATH)
webhook_routes = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(webhook_routes)

AUTH_ROUTE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fetcher_api"
    / "api"
    / "routes"
    / "auth.py"
)
auth_spec = importlib.util.spec_from_file_location("auth_routes_for_webhook_test", AUTH_ROUTE_PATH)
auth_routes = importlib.util.module_from_spec(auth_spec)
assert auth_spec.loader is not None
auth_spec.loader.exec_module(auth_routes)


class InstagramWebhookSignatureTest(unittest.TestCase):
    def setUp(self):
        self.previous_app_secret = os.environ.get("INSTAGRAM_APP_SECRET")
        self.previous_verify_token = os.environ.get("WEBHOOK_VERIFY_TOKEN")
        os.environ["WEBHOOK_VERIFY_TOKEN"] = "verify-token"
        self.app = Flask(__name__)
        self.app.register_blueprint(webhook_routes.webhook_bp, url_prefix="/api")
        self.client = self.app.test_client()

    def tearDown(self):
        self._restore_env("INSTAGRAM_APP_SECRET", self.previous_app_secret)
        self._restore_env("WEBHOOK_VERIFY_TOKEN", self.previous_verify_token)

    def _restore_env(self, name, value):
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value

    def _signature(self, body: bytes, secret: str = "meta-secret") -> str:
        digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def _post(self, body: bytes, signature: str | None):
        headers = {"Content-Type": "application/json"}
        if signature is not None:
            headers["X-Hub-Signature-256"] = signature
        return self.client.post("/api/webhook/instagram", data=body, headers=headers)

    def test_get_challenge_still_works_without_signature_header(self):
        response = self.client.get(
            "/api/webhook/instagram?hub.verify_token=verify-token&hub.challenge=challenge-value"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "challenge-value")

    def test_post_missing_configured_secret_rejects_before_processing(self):
        os.environ.pop("INSTAGRAM_APP_SECRET", None)
        body = b'{"entry":[]}'

        with patch.object(webhook_routes, "_process_message_event") as process_message:
            response = self._post(body, self._signature(body))

        self.assertEqual(response.status_code, 403)
        process_message.assert_not_called()

    def test_post_blank_configured_secret_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "   "
        body = b'{"entry":[]}'

        with patch.object(webhook_routes, "_process_message_event") as process_message:
            response = self._post(body, self._signature(body))

        self.assertEqual(response.status_code, 403)
        process_message.assert_not_called()

    def test_post_missing_signature_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = b'{"entry":[]}'

        with patch.object(webhook_routes, "_process_message_event") as process_message:
            response = self._post(body, None)

        self.assertEqual(response.status_code, 403)
        process_message.assert_not_called()

    def test_post_malformed_signature_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = b'{"entry":[]}'

        for signature in ("sha1=abc", "sha256=abc", "sha256=not-hex"):
            with self.subTest(signature=signature):
                with patch.object(webhook_routes, "_process_message_event") as process_message:
                    response = self._post(body, signature)

                self.assertEqual(response.status_code, 403)
                process_message.assert_not_called()

    def test_post_wrong_signature_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = b'{"entry":[]}'

        with patch.object(webhook_routes, "_process_message_event") as process_message:
            response = self._post(body, self._signature(body, secret="wrong-secret"))

        self.assertEqual(response.status_code, 403)
        process_message.assert_not_called()

    def test_post_valid_signature_preserves_existing_success_response(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = (
            b'{"entry":[{"changes":[{"field":"messages","value":{"sender":{"id":"sender-1"},'
            b'"message":{"text":"hello"}}}]}]}'
        )

        with patch.object(webhook_routes, "_process_message_event") as process_message:
            response = self._post(body, self._signature(body))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "OK")
        process_message.assert_called_once_with("sender-1", {"text": "hello"})

    def test_valid_signature_is_computed_over_exact_raw_bytes(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        compact_body = b'{"entry":[]}'
        spaced_body = b'{ "entry" : [] }'

        with patch.object(webhook_routes, "_process_message_event") as process_message:
            rejected = self._post(spaced_body, self._signature(compact_body))
            accepted = self._post(spaced_body, self._signature(spaced_body))

        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(accepted.status_code, 200)
        process_message.assert_not_called()

class AuthMountedInstagramWebhookSignatureTest(unittest.TestCase):
    def setUp(self):
        self.previous_app_secret = os.environ.get("INSTAGRAM_APP_SECRET")
        self.previous_verify_token = os.environ.get("WEBHOOK_VERIFY_TOKEN")
        os.environ["WEBHOOK_VERIFY_TOKEN"] = "verify-token"
        auth_routes.PROCESSED_WEBHOOKS.clear()
        self.app = Flask(__name__)
        self.app.register_blueprint(auth_routes.auth_bp, url_prefix="/api/auth")
        self.client = self.app.test_client()

    def tearDown(self):
        auth_routes.PROCESSED_WEBHOOKS.clear()
        self._restore_env("INSTAGRAM_APP_SECRET", self.previous_app_secret)
        self._restore_env("WEBHOOK_VERIFY_TOKEN", self.previous_verify_token)

    def _restore_env(self, name, value):
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value

    def _signature(self, body: bytes, secret: str = "meta-secret") -> str:
        digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def _post(self, body: bytes, signature: str | None):
        headers = {"Content-Type": "application/json"}
        if signature is not None:
            headers["X-Hub-Signature-256"] = signature
        return self.client.post("/api/auth/webhook/instagram", data=body, headers=headers)

    def _assert_rejected_without_side_effects(self, body: bytes, signature: str | None):
        with patch.object(auth_routes, "_handle_incoming_message") as handle_message, \
             patch.object(auth_routes, "execute") as execute, \
             patch.object(auth_routes.threading, "Thread") as thread:
            response = self._post(body, signature)

        self.assertEqual(response.status_code, 403)
        handle_message.assert_not_called()
        execute.assert_not_called()
        thread.assert_not_called()

    def test_auth_get_challenge_still_works_without_signature_header(self):
        response = self.client.get(
            "/api/auth/webhook/instagram"
            "?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "challenge-value")

    def test_auth_post_missing_configured_secret_rejects_before_processing(self):
        os.environ.pop("INSTAGRAM_APP_SECRET", None)
        body = b'{"entry":[]}'

        self._assert_rejected_without_side_effects(body, self._signature(body))

    def test_auth_post_blank_configured_secret_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "   "
        body = b'{"entry":[]}'

        self._assert_rejected_without_side_effects(body, self._signature(body))

    def test_auth_post_missing_signature_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = b'{"entry":[]}'

        self._assert_rejected_without_side_effects(body, None)

    def test_auth_post_malformed_signature_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = b'{"entry":[]}'

        for signature in ("sha1=abc", "sha256=abc", "sha256=not-hex"):
            with self.subTest(signature=signature):
                self._assert_rejected_without_side_effects(body, signature)

    def test_auth_post_wrong_signature_rejects_before_processing(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = b'{"entry":[]}'

        self._assert_rejected_without_side_effects(body, self._signature(body, secret="wrong-secret"))

    def test_auth_post_valid_signature_preserves_existing_response_and_downstream_behavior(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        body = (
            b'{"entry":[{"changes":[{"field":"messages","value":{"sender":{"id":"sender-1"},'
            b'"message":{"text":"hello"}}}]}]}'
        )

        with patch.object(auth_routes, "_handle_incoming_message") as handle_message:
            response = self._post(body, self._signature(body))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "EVENT_RECEIVED")
        handle_message.assert_called_once_with("sender-1", "hello", {"text": "hello"})

    def test_auth_valid_signature_is_computed_over_exact_raw_bytes(self):
        os.environ["INSTAGRAM_APP_SECRET"] = "meta-secret"
        compact_body = b'{"entry":[]}'
        spaced_body = b'{ "entry" : [] }'

        with patch.object(auth_routes, "_handle_incoming_message") as handle_message:
            rejected = self._post(spaced_body, self._signature(compact_body))
            accepted = self._post(spaced_body, self._signature(spaced_body))

        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.get_data(as_text=True), "EVENT_RECEIVED")
        handle_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
