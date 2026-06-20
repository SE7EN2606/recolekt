import unittest
from unittest.mock import patch

from fetcher_api.services import processing_recovery


class ProcessingRecoveryTest(unittest.TestCase):
    def test_recover_stale_processing_reels_marks_rows_error(self):
        executed = []

        with patch.object(
            processing_recovery,
            "fetch_all",
            return_value=[
                {"id": "reel-1"},
                {"id": "reel-2"},
            ],
        ) as fetch_mock:
            with patch.object(
                processing_recovery,
                "execute",
                side_effect=lambda sql, params=None, commit=True: executed.append((sql, params, commit)),
            ):
                result = processing_recovery.recover_stale_processing_reels(
                    user_id="user-1",
                    timeout_seconds=120,
                )

        self.assertEqual(result["cleaned"], 2)
        self.assertEqual(result["reel_ids"], ["reel-1", "reel-2"])
        self.assertEqual(result["error_message"], "processing_worker_killed_or_timeout")
        fetch_sql, fetch_params = fetch_mock.call_args.args
        self.assertIn("status = 'processing'", fetch_sql)
        self.assertIn("user_id = %s", fetch_sql)
        self.assertEqual(fetch_params, ("user-1", 120))
        update_sql, update_params, commit = executed[0]
        self.assertIn("status = 'error'", update_sql)
        self.assertEqual(update_params, ("processing_worker_killed_or_timeout", ["reel-1", "reel-2"]))
        self.assertTrue(commit)

    def test_recover_stale_processing_reels_noops_when_none_found(self):
        with patch.object(processing_recovery, "fetch_all", return_value=[]):
            with patch.object(processing_recovery, "execute") as execute_mock:
                result = processing_recovery.recover_stale_processing_reels(timeout_seconds=120)

        self.assertEqual(result["cleaned"], 0)
        self.assertEqual(result["reel_ids"], [])
        execute_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
