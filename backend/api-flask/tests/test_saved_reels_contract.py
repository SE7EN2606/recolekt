import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask

ROUTES_PATH = Path(__file__).resolve().parents[1] / "fetcher_api" / "api" / "routes.py"
routes_spec = importlib.util.spec_from_file_location("legacy_routes_for_saved_reels_test", ROUTES_PATH)
legacy_routes = importlib.util.module_from_spec(routes_spec)
assert routes_spec.loader is not None
routes_spec.loader.exec_module(legacy_routes)

SAVED_REELS_PATH = (
    Path(__file__).resolve().parents[1]
    / "fetcher_api"
    / "api"
    / "routes"
    / "saved_reels.py"
)
saved_reels_spec = importlib.util.spec_from_file_location(
    "saved_reels_routes_for_contract_test",
    SAVED_REELS_PATH,
)
saved_reels_routes = importlib.util.module_from_spec(saved_reels_spec)
assert saved_reels_spec.loader is not None
saved_reels_spec.loader.exec_module(saved_reels_routes)


HEAVY_RECIPE = {
    "title": "Large Recipe",
    "ingredients": [{"name": f"ingredient-{idx}", "amount": "1 cup"} for idx in range(40)],
    "steps": [f"step {idx}" for idx in range(80)],
}
HEAVY_TRANSCRIPTION = {"transcript": "word " * 1200}


def make_row(idx: int, status: str = "done", content_type: str = "recipe") -> dict:
    return {
        "id": f"reel-{idx:03d}",
        "source_url": f"https://www.instagram.com/reel/{idx:03d}/",
        "folder_id": "folder-1" if idx % 2 else None,
        "is_favorite": idx % 3 == 0,
        "status": status,
        "content_type": content_type,
        "list_subtype": "recipe",
        "created_at": f"2026-07-{(idx % 28) + 1:02d}T12:00:00",
        "updated_at": f"2026-07-{(idx % 28) + 1:02d}T13:00:00",
        "author_name": f"Author {idx}",
        "duration": "1:23",
        "duration_seconds": 83,
        "thumbnail_url": f"https://cdn.example.test/{idx}.jpg",
        "summary_title": f"Recipe {idx}",
        "summary_topic": "Dinner",
        "summary_category": "Recipe",
        "error_message": "Processing failed" if status in {"failed", "error"} else None,
        "recipe_cook_count": idx,
        "recipe_last_cooked_at": f"2026-07-{(idx % 28) + 1:02d}T14:00:00",
        "recipe_has_active_session": idx % 5 == 0,
        "recipe_active_session_id": f"session-{idx}" if idx % 5 == 0 else None,
        "recipe_has_note": idx % 4 == 0,
        "recipe_note_updated_at": f"2026-07-{(idx % 28) + 1:02d}T15:00:00" if idx % 4 == 0 else None,
    }


def make_legacy_row(idx: int) -> dict:
    row = make_row(idx)
    row.update(
        {
            "user_id": "user-1",
            "caption": "A useful caption",
            "transcription": HEAVY_TRANSCRIPTION,
            "recipe": HEAVY_RECIPE,
            "workout": {"sets": [{"name": "squats"} for _ in range(20)]},
            "tools_list": {"items": [{"name": "tool"} for _ in range(20)]},
            "location": {"places": [{"name": "place"} for _ in range(20)]},
            "gcs_urls": {"preview_thumbnail": row["thumbnail_url"], "large": "x" * 1000},
            "summary_text": {"summary": "Short summary", "hashtags": ["#recipe"]},
        }
    )
    return row


class SavedReelsContractTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(legacy_routes.api_bp, url_prefix="/api")
        self.app.register_blueprint(saved_reels_routes.saved_reels_bp, url_prefix="/api")
        self.client = self.app.test_client()
        self.fetch_calls = []
        self.recovery_calls = []

    def _install_mocks(self, rows):
        def fake_fetch_all(sql, params=None):
            self.fetch_calls.append((sql, params))
            return rows

        def fake_recovery(**kwargs):
            self.recovery_calls.append(kwargs)

        return patch.multiple(
            saved_reels_routes,
            get_user_id_from_request=lambda: "user-1",
            recover_stale_processing_reels=fake_recovery,
            fetch_all=fake_fetch_all,
        )

    def _get(self, query="", rows=None):
        with self._install_mocks(rows if rows is not None else [make_row(1)]):
            return self.client.get(f"/api/saved_reels{query}")

    def test_route_registration_resolves_to_canonical_handler(self):
        rules = [
            rule
            for rule in self.app.url_map.iter_rules()
            if rule.rule == "/api/saved_reels" and "GET" in rule.methods
        ]

        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].endpoint, "saved_reels.saved_reels")

    def test_default_pagination(self):
        response = self._get()

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["page"], 1)
        self.assertEqual(payload["per_page"], 100)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 100, 0))

    def test_page_2(self):
        response = self._get("?page=2&per_page=100")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 100, 100))

    def test_per_page_200(self):
        response = self._get("?per_page=200")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["per_page"], 200)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 200, 0))

    def test_per_page_500(self):
        response = self._get("?per_page=500&view=list")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["per_page"], 500)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 500, 0))

    def test_upper_bound_clamping(self):
        response = self._get("?per_page=5000")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["per_page"], 1000)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 1000, 0))

    def test_invalid_page_and_per_page(self):
        response = self._get("?page=bad&per_page=bad")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["page"], 1)
        self.assertEqual(payload["per_page"], 100)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 100, 0))

    def test_view_list_payload_excludes_heavy_detail_fields(self):
        response = self._get("?view=list", rows=[make_row(1)])

        reel = response.get_json()["reels"][0]
        for field in ("transcription", "recipe", "workout", "tools_list", "location", "summary", "gcs_urls"):
            self.assertNotIn(field, reel)

    def test_required_gallery_fields_remain_present(self):
        response = self._get("?view=list", rows=[make_row(4)])

        reel = response.get_json()["reels"][0]
        expected = {
            "id",
            "process_id",
            "source_url",
            "folder_id",
            "is_favorite",
            "status",
            "content_type",
            "list_subtype",
            "summary_title",
            "summary_topic",
            "summary_category",
            "created_at",
            "updated_at",
            "author_name",
            "duration",
            "duration_seconds",
            "thumbnail_url",
            "thumbnailUrl",
            "platform",
            "error_message",
            "recipe_user_state",
        }
        self.assertTrue(expected.issubset(reel.keys()))
        self.assertEqual(reel["recipe_user_state"]["cookCount"], 4)
        self.assertTrue(reel["recipe_user_state"]["hasNote"])

    def test_more_than_200_records_are_reachable(self):
        rows = [make_row(idx) for idx in range(201, 251)]
        response = self._get("?page=2&per_page=200", rows=rows)

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["count"], 50)
        self.assertEqual(self.fetch_calls[0][1], ("user-1", 200, 200))

    def test_processing_completed_and_failed_items(self):
        rows = [
            make_row(1, status="processing", content_type="general"),
            make_row(2, status="done", content_type="recipe"),
            make_row(3, status="failed", content_type="recipe"),
        ]
        response = self._get("?view=list", rows=rows)

        payload = response.get_json()
        self.assertEqual([reel["status"] for reel in payload["reels"]], ["processing", "done", "failed"])
        self.assertEqual(payload["reels"][2]["error_message"], "Processing failed")

    def test_folder_favorite_and_cooked_state(self):
        response = self._get("?view=list", rows=[make_row(15)])

        reel = response.get_json()["reels"][0]
        self.assertEqual(reel["folder_id"], "folder-1")
        self.assertTrue(reel["is_favorite"])
        self.assertEqual(reel["recipe_user_state"]["cookCount"], 15)
        self.assertTrue(reel["recipe_user_state"]["hasActiveSession"])

    def test_no_duplicate_ids_and_stable_pagination_metadata(self):
        rows = [make_row(idx) for idx in range(1, 4)]
        response = self._get("?page=3&per_page=3", rows=rows)

        payload = response.get_json()
        ids = [reel["id"] for reel in payload["reels"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(payload["page"], 3)
        self.assertEqual(payload["per_page"], 3)
        self.assertEqual(payload["count"], 3)

    def test_authorization_and_user_isolation_remain_in_query(self):
        response = self._get(rows=[make_row(1)])

        self.assertEqual(response.status_code, 200)
        sql, params = self.fetch_calls[0]
        self.assertIn("WHERE r.user_id = %s", sql)
        self.assertEqual(params[0], "user-1")

    def test_unauthorized_request_returns_401_without_recovery_or_query(self):
        with patch.object(saved_reels_routes, "get_user_id_from_request", side_effect=ValueError):
            with patch.object(saved_reels_routes, "recover_stale_processing_reels") as recovery:
                with patch.object(saved_reels_routes, "fetch_all") as fetch_all:
                    response = self.client.get("/api/saved_reels")

        self.assertEqual(response.status_code, 401)
        recovery.assert_not_called()
        fetch_all.assert_not_called()

    def test_query_shape_rules_out_obvious_n_plus_one(self):
        response = self._get("?per_page=500", rows=[make_row(idx) for idx in range(1, 6)])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.fetch_calls), 1)
        self.assertEqual(len(self.recovery_calls), 1)
        sql = self.fetch_calls[0][0]
        self.assertIn("LEFT JOIN recipe_cook_summaries", sql)
        self.assertIn("LEFT JOIN LATERAL", sql)
        self.assertIn("LIMIT %s OFFSET %s", sql)

    def test_representative_payload_measurement(self):
        legacy_payload = legacy_routes._serialize_reel_row(make_legacy_row(1))
        list_payload = saved_reels_routes._serialize_reel_card_row(make_row(1))

        legacy_bytes = len(json.dumps({"reels": [legacy_payload]}, default=str).encode("utf-8"))
        list_bytes = len(json.dumps({"reels": [list_payload]}, default=str).encode("utf-8"))

        self.assertLess(list_bytes, legacy_bytes)
        self.assertEqual(len(legacy_payload), 21)
        self.assertEqual(len(list_payload), 21)
        self.assertGreater(legacy_bytes, list_bytes * 5)


if __name__ == "__main__":
    unittest.main()
