import unittest
import importlib.util
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from flask import Flask, redirect

AUTH_ROUTE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fetcher_api"
    / "api"
    / "routes"
    / "auth.py"
)
spec = importlib.util.spec_from_file_location("auth_routes_for_test", AUTH_ROUTE_PATH)
auth_routes = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(auth_routes)


class FakeGoogleOAuth:
    def __init__(self):
        self.authorize_redirect_calls = []
        self.access_token_calls = 0

    def authorize_redirect(self, redirect_uri, state):
        self.authorize_redirect_calls.append({"redirect_uri": redirect_uri, "state": state})
        return redirect(f"https://accounts.google.test/o/oauth?state={state}")

    def authorize_access_token(self):
        self.access_token_calls += 1
        return {
            "userinfo": {
                "email": "test@example.com",
                "name": "Test User",
                "sub": "google-user-id",
                "picture": "https://example.test/avatar.png",
            }
        }


class FakeOAuth:
    def __init__(self):
        self.google = FakeGoogleOAuth()


class GoogleOAuthSecurityTest(unittest.TestCase):
    def setUp(self):
        self.previous_frontend_base_url = os.environ.get("FRONTEND_BASE_URL")
        os.environ["FRONTEND_BASE_URL"] = "https://staging.recolekt.app"
        self.app = Flask(__name__)
        self.app.secret_key = "test-secret"
        self.app.config["SERVER_NAME"] = "api.test"
        self.app.register_blueprint(auth_routes.auth_bp, url_prefix="/api/auth")
        self.oauth = FakeOAuth()
        self.app.extensions["oauth"] = self.oauth
        self.client = self.app.test_client()

    def tearDown(self):
        if self.previous_frontend_base_url is None:
            os.environ.pop("FRONTEND_BASE_URL", None)
        else:
            os.environ["FRONTEND_BASE_URL"] = self.previous_frontend_base_url

    def test_safe_oauth_next_path_accepts_valid_paths(self):
        self.assertEqual(auth_routes._safe_oauth_next_path("/gallery"), "/gallery")
        self.assertEqual(
            auth_routes._safe_oauth_next_path("/video/123?tab=steps"),
            "/video/123?tab=steps",
        )

    def test_safe_oauth_next_path_replaces_unsafe_paths(self):
        for value in (
            "https://evil.example",
            "//evil.example",
            "javascript:alert(1)",
            "data:text/html,evil",
            "\\\\evil.example",
            "/\\evil.example",
            "/%5Cevil.example",
            "/%2F%2Fevil.example",
            "/gallery#token-sink",
        ):
            with self.subTest(value=value):
                self.assertEqual(auth_routes._safe_oauth_next_path(value), "/gallery")

    def test_login_stores_validated_next_separate_from_random_state(self):
        response = self.client.get("/api/auth/google/login?next=https://evil.example")

        self.assertEqual(response.status_code, 302)
        call = self.oauth.google.authorize_redirect_calls[-1]
        parsed = urlparse(response.headers["Location"])
        state = parse_qs(parsed.query)["state"][0]
        self.assertEqual(state, call["state"])
        self.assertNotEqual(state, "https://evil.example")
        self.assertGreaterEqual(len(state), 32)

        with self.client.session_transaction() as flask_session:
            self.assertEqual(flask_session["oauth_state"], state)
            self.assertEqual(flask_session["oauth_next_path"], "/gallery")

    def test_callback_rejects_missing_state_before_token_exchange(self):
        with self.client.session_transaction() as flask_session:
            flask_session["oauth_state"] = "expected"
            flask_session["oauth_next_path"] = "/video/123"
            flask_session["oauth_frontend_base"] = "https://staging.recolekt.app"

        response = self.client.get("/api/auth/google/callback")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.headers["Location"],
            "https://staging.recolekt.app/auth?error=invalid_state",
        )
        self.assertEqual(self.oauth.google.access_token_calls, 0)

    def test_callback_rejects_invalid_state_before_token_exchange(self):
        with self.client.session_transaction() as flask_session:
            flask_session["oauth_state"] = "expected"
            flask_session["oauth_next_path"] = "/video/123"
            flask_session["oauth_frontend_base"] = "https://staging.recolekt.app"

        response = self.client.get("/api/auth/google/callback?state=wrong")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.headers["Location"],
            "https://staging.recolekt.app/auth?error=invalid_state",
        )
        self.assertEqual(self.oauth.google.access_token_calls, 0)

    def test_callback_accepts_valid_state_and_uses_stored_next_path(self):
        with self.client.session_transaction() as flask_session:
            flask_session["oauth_state"] = "expected"
            flask_session["oauth_next_path"] = "/video/123?tab=steps"
            flask_session["oauth_frontend_base"] = "https://staging.recolekt.app"

        with patch.object(auth_routes, "fetch_one", return_value={"user_id": "user-1"}), \
             patch.object(auth_routes, "execute") as execute, \
             patch.object(auth_routes, "create_jwt_token", return_value="jwt-value"):
            response = self.client.get("/api/auth/google/callback?state=expected")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.headers["Location"],
            "https://staging.recolekt.app/video/123?tab=steps&token=jwt-value",
        )
        self.assertEqual(self.oauth.google.access_token_calls, 1)
        execute.assert_called_once()

    def test_callback_consumes_state_to_prevent_replay(self):
        with self.client.session_transaction() as flask_session:
            flask_session["oauth_state"] = "expected"
            flask_session["oauth_next_path"] = "/gallery"
            flask_session["oauth_frontend_base"] = "https://staging.recolekt.app"

        with patch.object(auth_routes, "fetch_one", return_value={"user_id": "user-1"}), \
             patch.object(auth_routes, "execute"), \
             patch.object(auth_routes, "create_jwt_token", return_value="jwt-value"):
            first = self.client.get("/api/auth/google/callback?state=expected")

        replay = self.client.get("/api/auth/google/callback?state=expected")

        self.assertEqual(first.status_code, 302)
        self.assertEqual(
            first.headers["Location"],
            "https://staging.recolekt.app/gallery?token=jwt-value",
        )
        self.assertEqual(replay.status_code, 302)
        self.assertEqual(
            replay.headers["Location"],
            "https://staging.recolekt.app/auth?error=invalid_state",
        )
        self.assertEqual(self.oauth.google.access_token_calls, 1)


if __name__ == "__main__":
    unittest.main()
