import os
import unittest

import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False
os.environ["RAILWAY_ENVIRONMENT"] = "staging"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["GCS_CREDENTIALS_JSON"] = ""
os.environ["GCS_CREDENTIALS_PATH"] = "/tmp/recolekt-test-no-gcs.json"
os.environ["MISTRAL_API_KEY"] = "test-key"

from app import app


class RefreshRouteCorsTest(unittest.TestCase):
    def test_refresh_route_is_registered_with_options(self):
        matches = [
            rule
            for rule in app.url_map.iter_rules()
            if rule.rule == "/api/reels/<path:reel_id>/refresh"
        ]

        self.assertEqual(len(matches), 1)
        self.assertIn("POST", matches[0].methods)
        self.assertIn("OPTIONS", matches[0].methods)

    def test_refresh_options_preflight_is_not_404_and_has_cors_headers(self):
        client = app.test_client()
        response = client.open(
            "/api/reels/test-id/refresh",
            method="OPTIONS",
            headers={
                "Origin": "https://staging.recolekt.app",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

        self.assertIn(response.status_code, (200, 204))
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://staging.recolekt.app",
        )
        self.assertIn("POST", response.headers.get("Access-Control-Allow-Methods", ""))
        allow_headers = response.headers.get("Access-Control-Allow-Headers", "").lower()
        self.assertIn("authorization", allow_headers)
        self.assertIn("content-type", allow_headers)

    def test_refresh_post_without_auth_reaches_route(self):
        client = app.test_client()
        response = client.post(
            "/api/reels/test-id/refresh",
            headers={"Origin": "https://staging.recolekt.app"},
        )

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
