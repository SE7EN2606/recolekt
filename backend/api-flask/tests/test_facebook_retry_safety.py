import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False
os.environ["GCS_CREDENTIALS_JSON"] = ""
os.environ["GCS_CREDENTIALS_PATH"] = "/tmp/recolekt-test-no-gcs.json"
os.environ["MISTRAL_API_KEY"] = "test-key"


class FacebookRetrySafetyTest(unittest.TestCase):
    def test_existing_done_force_retry_queues_same_id_without_delete(self):
        from fetcher_api.api.routes import video

        reel_id = "872789235085022--20260228_0221_41--6be765c3"
        executed_sql = []
        started_threads = []

        class FakeThread:
            def __init__(self, target, args, daemon):
                self.target = target
                self.args = args
                self.daemon = daemon

            def start(self):
                started_threads.append(self)

        with patch.object(video, "execute", side_effect=lambda sql, params=None: executed_sql.append(sql)):
            with patch.object(video.threading, "Thread", FakeThread):
                queued = video._queue_existing_reel_refresh(
                    reel_id,
                    "user-1",
                    "https://www.facebook.com/reel/872789235085022",
                    True,
                )

        self.assertEqual(queued["status_code"], 202)
        self.assertEqual(queued["payload"]["process_id"], reel_id)
        self.assertEqual(queued["payload"]["reel_id"], reel_id)
        self.assertTrue(started_threads)
        self.assertFalse(any("DELETE FROM reels" in sql for sql in executed_sql))
        self.assertFalse(any("gcs_urls" in sql for sql in executed_sql))

    def test_existing_failed_facebook_download_preserves_row_content(self):
        from fetcher_api.api.helpers import processing

        executed = []
        result = {
            "process_id": "872789235085022--20260228_0221_41--6be765c3",
            "id": "872789235085022--20260228_0221_41--6be765c3",
            "user_id": "user-1",
            "summary": {},
            "caption": "",
            "gcs_urls": {},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "input.mp4")
            with patch.object(processing, "download_instagram_video", return_value={
                "success": False,
                "error_code": "facebook_extraction_failed",
                "metadata": {},
            }):
                with patch.object(processing, "execute", side_effect=lambda sql, params=None: executed.append((sql, params))):
                    with patch.object(processing, "insert_reel_into_db", side_effect=AssertionError("must not upsert empty error payload")):
                        processing.background_process(
                            result,
                            video_path,
                            temp_dir,
                            "872789235085022",
                            "",
                            "https://www.facebook.com/reel/872789235085022",
                            True,
                            "",
                            None,
                            "user-1",
                            force=True,
                        )

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_message"], "facebook_extraction_failed")
        self.assertTrue(any("SET status = 'error'" in sql for sql, _ in executed))
        self.assertFalse(any("DELETE FROM reels" in sql for sql, _ in executed))

    def test_failed_facebook_download_after_three_attempts_saves_clear_error(self):
        from fetcher_api.api.helpers import processing

        saved_payloads = []
        result = {
            "process_id": "872789235085022--20260228_0221_41--6be765c3",
            "id": "872789235085022--20260228_0221_41--6be765c3",
            "user_id": "user-1",
            "summary": {},
            "caption": "",
            "gcs_urls": {},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "input.mp4")
            with patch.object(processing, "download_instagram_video", return_value={
                "success": False,
                "error_code": "facebook_download_failed_after_3_attempts",
                "error": "Facebook video download failed after 3 attempts.",
                "attempts": 3,
                "metadata": {},
            }):
                with patch.object(processing, "insert_reel_into_db", side_effect=lambda payload: saved_payloads.append(dict(payload))):
                    processing.background_process(
                        result,
                        video_path,
                        temp_dir,
                        "872789235085022",
                        "",
                        "https://www.facebook.com/reel/872789235085022",
                        True,
                        "",
                        None,
                        "user-1",
                        force=False,
                    )

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_message"], "Facebook video download failed after 3 attempts.")
        self.assertEqual(saved_payloads[0]["status"], "error")
        self.assertEqual(saved_payloads[0]["error_message"], "Facebook video download failed after 3 attempts.")

    def test_existing_error_retry_reuses_same_id_without_preemptive_delete(self):
        from fetcher_api.api.routes import video

        reel_id = "872789235085022--20260228_0221_41--6be765c3"
        executed_sql = []

        class FakeThread:
            def __init__(self, target, args, daemon):
                self.args = args

            def start(self):
                pass

        with patch.object(video, "execute", side_effect=lambda sql, params=None: executed_sql.append(sql)):
            with patch.object(video.threading, "Thread", FakeThread):
                queued = video._queue_existing_reel_refresh(
                    reel_id,
                    "user-1",
                    "https://www.facebook.com/reel/872789235085022",
                    True,
                )

        self.assertEqual(queued["payload"]["process_id"], reel_id)
        self.assertFalse(any("DELETE FROM reels" in sql for sql in executed_sql))

    def test_successful_retry_replaces_content_after_success_with_same_id(self):
        from fetcher_api.api.helpers import processing

        saved_payloads = []
        result = {
            "process_id": "872789235085022--20260228_0221_41--6be765c3",
            "id": "872789235085022--20260228_0221_41--6be765c3",
            "user_id": "user-1",
            "summary": {},
            "caption": "",
            "gcs_urls": {},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "input.mp4")
            with open(video_path, "wb") as handle:
                handle.write(b"video")

            with patch.object(processing, "get_video_duration", return_value=("0:12", 12)):
                with patch.object(processing, "_run_transcription", return_value=SimpleNamespace(
                    status="done",
                    transcription_source="test",
                    transcript="mix pasta with tomato",
                    detected_language="en",
                    deepgram=None,
                    voxtral=None,
                )):
                    with patch.object(processing, "generate_reel_thumbnail", return_value=True):
                        with patch.object(processing, "_upload_thumbnail_and_persist"):
                            with patch.object(processing, "_upload_result_json_and_attach"):
                                with patch.object(processing, "_save_input_payload"):
                                    with patch.object(processing, "_save_content_payload"):
                                        with patch.object(processing, "analyze_instagram_video", return_value={
                                            "summary": {"english": {"title": "Tomato pasta", "summary": "Fast pasta."}},
                                            "content_type": "recipe",
                                            "recipe": {"english": {"title": "Tomato pasta", "ingredients": [], "instructions": []}},
                                            "detected_language": "en",
                                        }):
                                            with patch.object(processing, "insert_reel_into_db", side_effect=lambda payload: saved_payloads.append(dict(payload))):
                                                processing.background_process(
                                                    result,
                                                    video_path,
                                                    temp_dir,
                                                    "872789235085022",
                                                    "old caption",
                                                    "https://www.facebook.com/reel/872789235085022",
                                                    True,
                                                    "author",
                                                    None,
                                                    "user-1",
                                                    force=True,
                                                )

        self.assertEqual(len(saved_payloads), 1)
        saved = saved_payloads[0]
        self.assertEqual(saved["process_id"], "872789235085022--20260228_0221_41--6be765c3")
        self.assertEqual(saved["status"], "done")
        self.assertEqual(saved["summary_title"], "Tomato pasta")

    def test_forced_extractor_exception_signal_does_not_save_success_payload(self):
        from fetcher_api.api.helpers import processing

        executed = []
        result = {
            "process_id": "DUshSVfAkXF--20260226_2146_32--237407b7",
            "id": "DUshSVfAkXF--20260226_2146_32--237407b7",
            "user_id": "user-1",
            "summary": {},
            "caption": "",
            "gcs_urls": {"result_json": "old-result.json", "preview_thumbnail": "old-thumb.webp"},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "input.mp4")
            with open(video_path, "wb") as handle:
                handle.write(b"video")

            with patch.object(processing, "get_video_duration", return_value=("0:12", 12)):
                with patch.object(processing, "_run_transcription", return_value=SimpleNamespace(
                    status="done",
                    transcription_source="test",
                    transcript="mescola pasta e pomodoro",
                    detected_language="it",
                    deepgram=None,
                    voxtral=None,
                )):
                    with patch.object(processing, "generate_reel_thumbnail", return_value=True):
                        with patch.object(processing, "_save_input_payload"):
                            with patch.object(processing, "analyze_instagram_video", return_value={
                                "_extraction_failed": True,
                                "_extraction_error": "translated_workout_schema is not defined",
                            }) as analyze_mock:
                                with patch.object(processing, "_upload_thumbnail_and_persist", side_effect=AssertionError("must not overwrite thumbnail before extractor success")):
                                    with patch.object(processing, "_upload_result_json_and_attach", side_effect=AssertionError("must not upload fallback result JSON")):
                                        with patch.object(processing, "insert_reel_into_db", side_effect=AssertionError("must not upsert forced extractor failure as success")):
                                            with patch.object(processing, "execute", side_effect=lambda sql, params=None: executed.append((sql, params))):
                                                processing.background_process(
                                                    result,
                                                    video_path,
                                                    temp_dir,
                                                    "DUshSVfAkXF",
                                                    "caption",
                                                    "https://www.instagram.com/reel/DUshSVfAkXF/",
                                                    True,
                                                    "author",
                                                    None,
                                                    "user-1",
                                                    force=True,
                                                )

        self.assertTrue(analyze_mock.call_args.kwargs.get("fail_on_extractor_error"))
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_message"], "extraction_failed")
        self.assertTrue(any("SET status = 'error'" in sql for sql, _ in executed))

    def test_facebook_download_tries_distinct_url_forms_with_cookies_and_stops_on_success(self):
        from fetcher_api.adapters import meta_client as meta_module

        client = meta_module.MetaClient.__new__(meta_module.MetaClient)
        attempts = []
        option_sets = []

        class FakeYDL:
            def __init__(self, opts):
                self.opts = opts
                option_sets.append(dict(opts))

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def extract_info(self, url, download=False):
                attempts.append(url)
                if url.endswith("/reel/872789235085022"):
                    raise ValueError("Cannot parse data")
                with open(self.opts["outtmpl"], "wb") as handle:
                    handle.write(b"video")
                return {"id": "872789235085022", "title": "Recovered reel", "uploader": "Page"}

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = os.path.join(temp_dir, "fb.mp4")
            cookie_path = os.path.join(temp_dir, "cookies.txt")
            with open(cookie_path, "w", encoding="utf-8") as handle:
                handle.write("# Netscape HTTP Cookie File\n")

            with patch.object(client, "_get_facebook_graph_info", return_value=None):
                with patch.object(client, "get_post_info", return_value=None):
                    with patch.object(client, "_write_cookies", return_value=cookie_path):
                        with patch.object(meta_module.yt_dlp, "YoutubeDL", FakeYDL):
                            result = client.download_video(
                                "https://www.facebook.com/reel/872789235085022",
                                output_path,
                            )

        self.assertTrue(result["success"])
        self.assertEqual(
            attempts,
            [
                "https://www.facebook.com/reel/872789235085022",
                "https://www.facebook.com/watch/?v=872789235085022",
            ],
        )
        self.assertTrue(all(opts.get("cookiefile") for opts in option_sets))
        self.assertTrue(all(opts.get("retries") == 0 for opts in option_sets))
        self.assertTrue(all(opts.get("fragment_retries") == 0 for opts in option_sets))

    def test_facebook_download_stops_after_three_failed_ytdlp_attempts(self):
        from fetcher_api.adapters import meta_client as meta_module

        client = meta_module.MetaClient.__new__(meta_module.MetaClient)
        attempts = []
        option_sets = []

        class FakeYDL:
            def __init__(self, opts):
                self.opts = opts
                option_sets.append(dict(opts))

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def extract_info(self, url, download=False):
                attempts.append(url)
                raise ValueError("Cannot parse data")

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = os.path.join(temp_dir, "fb.mp4")

            with patch.object(client, "_get_facebook_graph_info", return_value=None):
                with patch.object(client, "get_post_info", return_value=None):
                    with patch.object(client, "_write_cookies", return_value=None):
                        with patch.object(
                            client,
                            "_facebook_url_candidates",
                            return_value=[
                                "https://www.facebook.com/reel/1",
                                "https://www.facebook.com/reel/2",
                                "https://www.facebook.com/reel/3",
                                "https://www.facebook.com/reel/4",
                                "https://www.facebook.com/reel/5",
                            ],
                        ):
                            with patch.object(meta_module.yt_dlp, "YoutubeDL", FakeYDL):
                                result = client.download_video(
                                    "https://www.facebook.com/reel/872789235085022",
                                    output_path,
                                )

        self.assertFalse(result["success"])
        self.assertEqual(result["error_code"], "facebook_download_failed_after_3_attempts")
        self.assertEqual(result["attempts"], 3)
        self.assertEqual(
            attempts,
            [
                "https://www.facebook.com/reel/1",
                "https://www.facebook.com/reel/2",
                "https://www.facebook.com/reel/3",
            ],
        )
        self.assertTrue(all(opts.get("retries") == 0 for opts in option_sets))
        self.assertTrue(all(opts.get("fragment_retries") == 0 for opts in option_sets))


if __name__ == "__main__":
    unittest.main()
