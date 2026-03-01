"""
Billing and subscription routes - Updated for Railway & NeonDB Tier Sync
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

# Stripe config
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_PRO_MONTHLY = os.getenv("STRIPE_PRICE_PRO_MONTHLY", "")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def _ensure_billing_customer(user_id: str):
    """Ensure billing_customers row exists"""
    execute(
        "INSERT INTO billing_customers (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING;",
        (user_id,),
    )


def _get_plan(user_id: str) -> str:
    """Get user's subscription plan from the main users table"""
    return get_user_tier(user_id)


def _sync_user_tier(user_id: str, stripe_status: str):
    """Updates the 'tier' in users table based on Stripe subscription status"""
    # Active or Trialing users get 'pro'. Everything else (canceled, past_due) is 'free'.
    new_tier = 'pro' if stripe_status in ("active", "trialing") else 'free'
    execute(
        "UPDATE users SET tier = %s WHERE user_id = %s;",
        (new_tier, user_id)
    )
    logger.info(f"💳 Tier Sync: User {user_id} set to {new_tier} (Stripe: {stripe_status})")


# Export helpers
__all__ = ['billing_bp', '_get_plan', '_ensure_billing_customer']

# ---------------------------------------------------------
# ROUTES
# ---------------------------------------------------------

@billing_bp.route("/billing/create-checkout-session", methods=["POST"])
def create_checkout_session():
    """Create Stripe checkout session for Pro subscription"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    _ensure_billing_customer(user_id)

    if not stripe.api_key:
        return jsonify({"error": "Missing STRIPE_SECRET_KEY"}), 500
    if not STRIPE_PRICE_PRO_MONTHLY:
        return jsonify({"error": "Missing STRIPE_PRICE_PRO_MONTHLY"}), 500

    session_obj = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": STRIPE_PRICE_PRO_MONTHLY, "quantity": 1}],
        success_url=f"{FRONTEND_BASE_URL}/billing?success=true",
        cancel_url=f"{FRONTEND_BASE_URL}/billing?cancel=true",
        client_reference_id=user_id,
        subscription_data={"trial_period_days": 7},
    )
    return jsonify({"url": session_obj.url})


@billing_bp.route("/billing/webhook", methods=["POST"])
def webhook():
    """Handle Stripe webhook events and sync with users table"""
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
    
    # NEW DEBUG LOGS - These will show up in Railway Logs
    logger.info(f"🔔 Received Webhook: {etype}")
    
    def _ts(unix_seconds):
        if not unix_seconds: return None
        return datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)

    # 1. Handle Initial Checkout Success
    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer_id = obj.get("customer")
        logger.info(f"📍 Checkout Session: user={user_id}, customer={customer_id}")
        
        # ... rest of your checkout code ...

    # 2. Handle Recurring Subscription Updates/Cancellations
    elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        customer_id = obj.get("customer")
        status = obj.get("status")
        logger.info(f"📍 Sub Event: customer={customer_id}, status={status}")
        
        row = fetch_one("SELECT user_id FROM billing_customers WHERE stripe_customer_id=%s;", (customer_id,))
        user_id = (row or {}).get("user_id")
        
        if user_id:
            logger.info(f"✅ Found mapping: customer {customer_id} -> user {user_id}")
            execute(
                """
                INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, current_period_end)
                VALUES (%s,%s,%s,'pro',%s)
                ON CONFLICT (stripe_subscription_id)
                DO UPDATE SET status=EXCLUDED.status, updated_at=now();
                """,
                (user_id, obj.get("id"), status, _ts(obj.get("current_period_end")))
            )
            _sync_user_tier(user_id, status)
        else:
            logger.warning(f"⚠️ Webhook: No user found for Stripe Customer ID {customer_id}")

    return jsonify({"received": True})
