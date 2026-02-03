#!/bin/bash
# Quick check: What imports what in your actual codebase

echo "================================================"
echo "🔍 ACTUAL IMPORTS IN YOUR BACKEND"
echo "================================================"
echo ""

echo "--- Main Entry Point (app.py imports) ---"
if [ -f "fetcher_api/app.py" ]; then
    grep "^from\|^import" fetcher_api/app.py | head -20
else
    echo "app.py not found"
fi

echo ""
echo "--- Routes (routes.py imports) ---"
if [ -f "fetcher_api/api/routes.py" ]; then
    grep "^from\|^import" fetcher_api/api/routes.py | grep "fetcher_api" | head -20
else
    echo "routes.py not found"
fi

echo ""
echo "--- Processing (processing.py imports) ---"
if [ -f "fetcher_api/api/helpers/processing.py" ]; then
    grep "^from\|^import" fetcher_api/api/helpers/processing.py | grep "fetcher_api"
else
    echo "processing.py not found"
fi

echo ""
echo "================================================"
echo "🤖 AI FILES USAGE CHECK"
echo "================================================"
echo ""

for file in ai_helpers.py ai_prompts.py ai_router.py ai_summary.py ai_taxonomy.py ai_text_utils.py recipe_prompt.py reel_summary_utils.py; do
    echo "--- Who imports $file? ---"
    grep -r "from.*${file%.py}\|import.*${file%.py}" fetcher_api/ --include="*.py" 2>/dev/null | grep -v "^Binary" | head -5
    if [ $? -ne 0 ]; then
        echo "   ❌ UNUSED (no imports found)"
    fi
    echo ""
done

echo "================================================"
echo "🔧 CRITICAL FILES USAGE CHECK"
echo "================================================"
echo ""

for file in gcs_client.py instagram_client.py billing_routes.py storage.py db_insert.py transcription.py; do
    echo "--- Who imports $file? ---"
    grep -r "from.*${file%.py}\|import.*${file%.py}" fetcher_api/ --include="*.py" 2>/dev/null | grep -v "^Binary" | head -3
    if [ $? -ne 0 ]; then
        echo "   ⚠️  WARNING: No imports found (might be entry point)"
    fi
    echo ""
done
