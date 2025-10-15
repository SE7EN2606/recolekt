#!/bin/bash
set -e

# Install FFmpeg
sudo apt-get update
sudo apt-get install -y ffmpeg

# Start the application
python app.py
