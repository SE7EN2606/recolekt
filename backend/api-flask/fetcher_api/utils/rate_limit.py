import time
from datetime import datetime, timedelta
from typing import List

api_usage: List[datetime] = []

def check_api_limit(limit_per_minute=50):
    """Check if we're approaching the API rate limit"""
    global api_usage
    
    # Remove old entries (older than 1 minute)
    now = datetime.now()
    api_usage = [timestamp for timestamp in api_usage if now - timestamp < timedelta(minutes=1)]
    
    # Check if we're approaching the limit
    if len(api_usage) >= limit_per_minute:
        # Calculate how long to wait
        oldest_request = min(api_usage)
        wait_time = (60 - (now - oldest_request).total_seconds())
        if wait_time > 0:
            time.sleep(wait_time)
            return False
    
    # Record this API usage
    api_usage.append(now)
    return True
