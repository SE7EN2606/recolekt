# fetcher_api/api/routes/billing.py

"""
Billing and subscription routes
"""
import os
import logging
import stripe
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one

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
    """Get user's subscription plan"""
    _ensure_billing_customer(user_id)
    row = fetch_one("SELECT plan FROM user_entitlements WHERE user_id=%s;", (user_id,))
    return (row or {}).get("plan", "free")


def _count_saves(user_id: str) -> int:
    """Count user's saved reels"""
    row = fetch_one("SELECT COUNT(*)::int AS c FROM reels WHERE user_id=%s;", (user_id,))
    return int((row or {}).get("c", 0))


# Export helpers for use in other routes
__all__ = ['billing_bp', '_get_plan', '_count_saves', '_ensure_billing_customer']

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
    """Handle Stripe webhook events"""
    if not STRIPE_WEBHOOK_SECRET:
        return jsonify({"error": "Missing STRIPE_WEBHOOK_SECRET"}), 500

    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"❌ Stripe webhook signature verification failed: {e}")
        return jsonify({"error": "invalid signature"}), 400

    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}

    def _ts(unix_seconds):
        """Convert Unix timestamp to datetime"""
        if not unix_seconds:
            return None
        return datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)

    # Handle checkout completion
    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription")

        if user_id:
            _ensure_billing_customer(user_id)
            
            if customer_id:
                execute(
                    "UPDATE billing_customers SET stripe_customer_id=%s, updated_at=now() WHERE user_id=%s;",
                    (customer_id, user_id),
                )
            
            if subscription_id:
                sub = stripe.Subscription.retrieve(subscription_id)
                execute(
                    """
                    INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, trial_ends_at, current_period_end, cancel_at_period_end)
                    VALUES (%s,%s,%s,'pro',%s,%s,%s)
                    ON CONFLICT (stripe_subscription_id)
                    DO UPDATE SET 
                        status=EXCLUDED.status, 
                        trial_ends_at=EXCLUDED.trial_ends_at,
                        current_period_end=EXCLUDED.current_period_end, 
                        cancel_at_period_end=EXCLUDED.cancel_at_period_end, 
                        updated_at=now();
                    """,
                    (
                        user_id, 
                        sub.get("id"), 
                        sub.get("status"), 
                        _ts(sub.get("trial_end")),
                        _ts(sub.get("current_period_end")), 
                        bool(sub.get("cancel_at_period_end", False))
                    ),
                )

    # Handle subscription events
    if etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        subscription_id = obj.get("id")
        customer_id = obj.get("customer")
        
        row = fetch_one("SELECT user_id FROM billing_customers WHERE stripe_customer_id=%s;", (customer_id,))
        user_id = (row or {}).get("user_id")
        
        if user_id:
            execute(
                """
                INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, trial_ends_at, current_period_end, cancel_at_period_end)
                VALUES (%s,%s,%s,'pro',%s,%s,%s)
                ON CONFLICT (stripe_subscription_id)
                DO UPDATE SET 
                    status=EXCLUDED.status, 
                    trial_ends_at=EXCLUDED.trial_ends_at,
                    current_period_end=EXCLUDED.current_period_end, 
                    cancel_at_period_end=EXCLUDED.cancel_at_period_end, 
                    updated_at=now();
                """,
                (
                    user_id, 
                    subscription_id, 
                    obj.get("status"), 
                    _ts(obj.get("trial_end")),
                    _ts(obj.get("current_period_end")), 
                    bool(obj.get("cancel_at_period_end", False))
                ),
            )

    return jsonify({"received": True})
