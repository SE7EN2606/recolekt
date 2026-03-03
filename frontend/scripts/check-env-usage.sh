#!/bin/bash

echo "Checking for illegal import.meta.env usage..."

RESULT=$(grep -R "import.meta.env" src | grep -v "src/utils/api.ts")

if [ ! -z "$RESULT" ]; then
  echo "❌ Forbidden import.meta.env usage found:"
  echo "$RESULT"
  exit 1
fi

echo "✅ Env usage clean."