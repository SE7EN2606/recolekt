#!/bin/bash

echo "Checking required frontend build env..."

if [ -z "$VITE_GOOGLE_MAPS_API_KEY" ] && [ -z "$VITE_GOOGLE_MAPS_KEY" ] && [ -z "$VITE_GOOGLE_API_KEY" ]; then
  echo "❌ Missing Google Maps frontend build env."
  echo "Set VITE_GOOGLE_MAPS_API_KEY on the Railway frontend service/build environment."
  exit 1
fi

echo "Checking for illegal import.meta.env usage..."

RESULT=$(grep -R "import.meta.env" src | grep -v "src/utils/api.ts")

if [ ! -z "$RESULT" ]; then
  echo "❌ Forbidden import.meta.env usage found:"
  echo "$RESULT"
  exit 1
fi

echo "✅ Env usage clean."