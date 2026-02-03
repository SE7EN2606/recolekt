# add_emojis_column.py
import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_iBpdlws7QI4m@ep-spring-shadow-ag1tupu6-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Add the column
cur.execute("ALTER TABLE reels ADD COLUMN IF NOT EXISTS summary_emojis TEXT[];")
conn.commit()

print("✅ Column 'summary_emojis' added successfully!")

cur.close()
conn.close()
