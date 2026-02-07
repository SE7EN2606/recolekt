# cleanup_stuck.py
from fetcher_api.adapters.db import execute, fetch_all
from datetime import datetime, timedelta

# Find stuck reels
stuck = fetch_all("""
    SELECT id, source_url, created_at 
    FROM reels 
    WHERE status = 'processing' 
    AND created_at < NOW() - INTERVAL '30 minutes'
""")

print(f"Found {len(stuck)} stuck reels:")
for reel in stuck:
    print(f"  - {reel}")

# Delete them
execute("""
    DELETE FROM reels 
    WHERE status = 'processing' 
    AND created_at < NOW() - INTERVAL '30 minutes'
""", commit=True)

print("✅ Cleaned up stuck reels!")
