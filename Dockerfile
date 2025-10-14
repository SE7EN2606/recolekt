# Use lightweight Python image
FROM python:3.11-slim

# Prevent interactive apt steps
ENV DEBIAN_FRONTEND=noninteractive

# Install FFmpeg and minimal runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg libsm6 libxext6 && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir fastapi uvicorn gunicorn instaloader moviepy requests python-dotenv

# Expose Render default web port
EXPOSE 10000

# Start FastAPI app using Gunicorn with Uvicorn worker
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app:app", "--bind", "0.0.0.0:10000"]
