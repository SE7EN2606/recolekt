# fetcher_api/services/rate_monitor.py
import os
import logging
from datetime import datetime
from fetcher_api.services.usage_tracker import get_usage

logger = logging.getLogger(__name__)

FREE_TIER_DAILY_LIMIT = 200


def get_mistral_limits():
    """Read internal usage stats only — zero API calls."""
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        return {"status": "error", "error": "MISTRAL_API_KEY not set"}

    try:
        usage = get_usage()
        calls_today = usage["calls_today"]
        estimated_remaining = max(0, FREE_TIER_DAILY_LIMIT - calls_today)

        return {
            "status": "ok",
            "model": "mistral-small-latest",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "remaining_tokens_month": usage.get("remaining_tokens_month", None),
            "calls_today": usage["calls_today"],
            "calls_total": usage["calls_total"],
            "tokens_estimated_today": usage["tokens_estimated_today"],
            "estimated_remaining": estimated_remaining,
            "daily_limit_estimate": FREE_TIER_DAILY_LIMIT,
            "last_call_at": usage["last_call_at"],
            "errors_today": usage["errors_today"],
        }

    except Exception as e:
        logger.error("Rate check failed: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "calls_today": 0,
            "calls_total": 0,
        }
