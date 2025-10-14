FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

# Set working directory
WORKDIR /app

# Copy everything
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir fastapi uvicorn gunicorn requests ffmpeg-python python-dotenv moviepy

# Expose (Render overrides this)
EXPOSE 8000

# Dynamic port binding for Render
CMD exec gunicorn -k uvicorn.workers.UvicornWorker backend.app:app --bind 0.0.0.0:${PORT:-8000}
