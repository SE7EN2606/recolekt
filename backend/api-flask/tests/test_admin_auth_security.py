import os
import unittest
from unittest.mock import patch

import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False
os.environ["RAILWAY_ENVIRONMENT"] = "staging"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["GCS_CREDENTIALS_JSON"] = ""
os.environ["GCS_CREDENTIALS_PATH"] = "/tmp/recolekt-test-no-gcs.json"
os.environ["MISTRAL_API_KEY"] = "test-key"

from app import app
from fetcher_api.api.routes import admin as admin_routes


class AdminAuthSecurityTest(unittest.TestCase):
    def setUp(self):
        self.previous_admin_key = os.environ.get("ADMIN_KEY")
        self.previous_admin_secret = os.environ.get("ADMIN_SECRET")
        self.client = app.test_client()

    def tearDown(self):
        self._restore_env("ADMIN_KEY", self.previous_admin_key)
        self._restore_env("ADMIN_SECRET", self.previous_admin_secret)

    def _restore_env(self, name, value):
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value

    def _clear_admin_config(self):
        os.environ.pop("ADMIN_KEY", None)
        os.environ.pop("ADMIN_SECRET", None)

    def _patch_dashboard_dependencies(self):
        return patch.multiple(
            admin_routes,
            _get_db_stats=lambda: {"total_users": 0, "daily": []},
            _get_mistral_usage=lambda: {},
            _get_deepgram_usage=lambda: {},
            _get_gcs_usage=lambda: {},
            _get_recent_errors=lambda: [],
            _get_recent_reels=lambda: [],
            _get_users_summary=lambda: [],
            _get_reel_platform_breakdown=lambda: [],
            _get_reel_type_breakdown=lambda: [],
            _get_newest_users=lambda: [],
            _get_last_processed_at=lambda: None,
        )

    def test_missing_configuration_denies_access(self):
        self._clear_admin_config()

        response = self.client.get("/api/admin/dashboard?key=anything")

        self.assertEqual(response.status_code, 401)

    def test_blank_configuration_denies_access(self):
        os.environ["ADMIN_KEY"] = "   "
        os.environ.pop("ADMIN_SECRET", None)

        response = self.client.get("/api/admin/dashboard?key=anything")

        self.assertEqual(response.status_code, 401)

    def test_wrong_secret_denies_access(self):
        os.environ["ADMIN_KEY"] = "configured-secret"
        os.environ.pop("ADMIN_SECRET", None)

        response = self.client.get("/api/admin/dashboard?key=wrong-secret")

        self.assertEqual(response.status_code, 401)

    def test_correct_secret_preserves_query_key_access(self):
        os.environ["ADMIN_KEY"] = "configured-secret"
        os.environ.pop("ADMIN_SECRET", None)

        with self._patch_dashboard_dependencies():
            response = self.client.get("/api/admin/dashboard?key=configured-secret")

        self.assertEqual(response.status_code, 200)

    def test_correct_secret_preserves_header_key_access(self):
        os.environ["ADMIN_KEY"] = "configured-secret"
        os.environ.pop("ADMIN_SECRET", None)

        with self._patch_dashboard_dependencies():
            response = self.client.get(
                "/api/admin/dashboard",
                headers={"X-Admin-Key": "configured-secret"},
            )

        self.assertEqual(response.status_code, 200)

    def test_old_fallback_value_is_rejected(self):
        self._clear_admin_config()

        response = self.client.get("/api/admin/dashboard?key=recolekt-admin-2026")

        self.assertEqual(response.status_code, 401)

    def test_admin_page_logs_no_supplied_or_configured_secret(self):
        os.environ["ADMIN_KEY"] = "configured-secret"
        os.environ.pop("ADMIN_SECRET", None)

        with self.assertLogs("app", level="INFO") as logs:
            response = self.client.get("/admin?key=configured-secret")

        self.assertEqual(response.status_code, 200)
        log_output = "\n".join(logs.output)
        self.assertNotIn("configured-secret", log_output)
        self.assertNotIn("recolekt-admin-2026", log_output)

    def test_admin_secret_env_remains_compatible(self):
        os.environ.pop("ADMIN_KEY", None)
        os.environ["ADMIN_SECRET"] = "configured-secret"

        with self._patch_dashboard_dependencies():
            response = self.client.get("/api/admin/dashboard?key=configured-secret")

        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
