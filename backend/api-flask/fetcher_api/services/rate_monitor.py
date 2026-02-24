# fetcher_api/services/rate_monitor.py
import os
import logging
from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage

logger = logging.getLogger(__name__)

def get_mistral_limits():
    """Check Mistral API rate limits via headers."""
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        logger.error("MISTRAL_API_KEY not set in environment")
        return {
            "status": "error",
            "error": "MISTRAL_API_KEY not set",
            "remaining_requests": None,
            "total_limit": None,
            "reset_seconds": None,
        }

    client = MistralClient(api_key=api_key)

    try:
        response = client.chat(
            model="mistral-small-latest",
            messages=[ChatMessage(role="user", content="Ping")],
        )

        # Access raw response headers
        headers = getattr(response, "_response", None)
        headers = dict(headers.headers) if headers and hasattr(headers, "headers") else {}

        remaining = headers.get("x-ratelimit-remaining-requests")
        limit = headers.get("x-ratelimit-limit-requests")
        reset = headers.get("x-ratelimit-reset-requests")

        logger.info(
            "📊 Mistral rate limits: remaining=%s, limit=%s, reset=%s",
            remaining, limit, reset,
        )

        return {
            "status": "ok",
            "remaining_requests": remaining,
            "total_limit": limit,
            "reset_seconds": reset,
            "model": "mistral-small-latest",
        }

    except Exception as e:
        logger.error("Rate limit check failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "error": str(e),
            "remaining_requests": None,
            "total_limit": None,
            "reset_seconds": None,
        }
