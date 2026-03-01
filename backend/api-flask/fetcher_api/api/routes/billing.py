# fetcher_api/api/routes/billing.py

"""
Billing and subscription routes - Fixed for Railway Deployment
"""
import os
import logging
import stripe
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one, get_user_tier

logger = logging.getLogger("billing")
billing_bp = Blueprint("billing", __name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_PRO_MONTHLY = os.getenv("STRIPE_PRICE_PRO_MONTHLY", "")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

def _ensure_billing_customer(user_id: str):
    execute("INSERT INTO billing_customers (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING;", (user_id,))

def _sync_user_tier(user_id: str, stripe_status: str):
    new_tier = 'pro' if stripe_status in ("active", "trialing") else 'free'
    execute("UPDATE users SET tier = %s WHERE user_id = %s;", (new_tier, user_id))
    logger.info(f"💳 Tier Sync: User {user_id} set to {new_tier} (Stripe: {stripe_status})")

def _ts(unix_seconds):
    if not unix_seconds: return None
    return datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)

@billing_bp.route("/billing/webhook", methods=["POST"])
def webhook():
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("❌ STRIPE_WEBHOOK_SECRET is not set!")
        return jsonify({"error": "Missing secret"}), 500

    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"❌ Stripe webhook signature verification failed: {e}")
        return jsonify({"error": "invalid signature"}), 400

    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    logger.info(f"🔔 Received Webhook: {etype}")

    # 1. Handle Initial Checkout Success
    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription")
        logger.info(f"📍 Checkout Session: user={user_id}, customer={customer_id}")
        
        if user_id:
            _ensure_billing_customer(user_id)
            if customer_id:
                execute("UPDATE billing_customers SET stripe_customer_id=%s, updated_at=now() WHERE user_id=%s;", (customer_id, user_id))
            
            if subscription_id:
                sub = stripe.Subscription.retrieve(subscription_id)
                status = sub.get("status")
                execute("""
                    INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, current_period_end)
                    VALUES (%s,%s,%s,'pro',%s)
                    ON CONFLICT (stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status, updated_at=now();
                """, (user_id, subscription_id, status, _ts(sub.get("current_period_end"))))
                _sync_user_tier(user_id, status)

    # 2. Handle Recurring Updates
    elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        customer_id = obj.get("customer")
        status = obj.get("status")
        logger.info(f"📍 Sub Event: customer={customer_id}, status={status}")
        
        row = fetch_one("SELECT user_id FROM billing_customers WHERE stripe_customer_id=%s;", (customer_id,))
        user_id = (row or {}).get("user_id")
        
        if user_id:
            execute("""
                INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, current_period_end)
                VALUES (%s,%s,%s,'pro',%s)
                ON CONFLICT (stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status, updated_at=now();
            """, (user_id, obj.get("id"), status, _ts(obj.get("current_period_end"))))
            _sync_user_tier(user_id, status)
        else:
            logger.warning(f"⚠️ Webhook: No user found for Customer {customer_id}")

    return jsonify({"received": True})
