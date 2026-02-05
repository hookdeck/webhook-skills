import os
import hmac
import hashlib
import base64
from typing import Any, Dict, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

# Load environment variables
load_dotenv()

app = FastAPI(title="WooCommerce Webhook Handler", version="1.0.0")

def verify_woocommerce_webhook(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """
    Verify WooCommerce webhook signature using HMAC SHA-256
    
    Args:
        raw_body: Raw request body as bytes
        signature: X-WC-Webhook-Signature header value
        secret: Webhook secret from WooCommerce
    
    Returns:
        True if signature is valid
    """
    if not signature or not secret or not raw_body:
        return False
    
    # Generate expected signature
    hash_digest = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).digest()
    
    expected_signature = base64.b64encode(hash_digest).decode('utf-8')
    
    # Use timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected_signature)

def handle_woocommerce_event(topic: str, payload: Dict[str, Any]) -> None:
    """
    Handle different WooCommerce event types
    
    Args:
        topic: Event topic (e.g., "order.created")
        payload: Webhook payload
    """
    print(f"Processing {topic} event for ID: {payload.get('id')}")
    
    if topic == 'order.created':
        print(f"New order #{payload.get('id')} for ${payload.get('total')}")
        # Add your order processing logic here
        
    elif topic == 'order.updated':
        print(f"Order #{payload.get('id')} updated to status: {payload.get('status')}")
        # Add your order update logic here
        
    elif topic == 'product.created':
        print(f"New product: {payload.get('name')} (ID: {payload.get('id')})")
        # Add your product sync logic here
        
    elif topic == 'product.updated':
        print(f"Product updated: {payload.get('name')} (ID: {payload.get('id')})")
        # Add your product update logic here
        
    elif topic == 'customer.created':
        print(f"New customer: {payload.get('email')} (ID: {payload.get('id')})")
        # Add your customer onboarding logic here
        
    elif topic == 'customer.updated':
        print(f"Customer updated: {payload.get('email')} (ID: {payload.get('id')})")
        # Add your customer update logic here
        
    else:
        print(f"Unhandled event type: {topic}")

@app.post("/webhooks/woocommerce")
async def handle_webhook(request: Request):
    """
    WooCommerce webhook endpoint
    """
    try:
        # Get headers
        signature = request.headers.get('x-wc-webhook-signature')
        topic = request.headers.get('x-wc-webhook-topic')
        source = request.headers.get('x-wc-webhook-source')
        secret = os.getenv('WOOCOMMERCE_WEBHOOK_SECRET')
        
        print(f"Received webhook: {topic} from {source}")
        
        # Get raw body for signature verification
        raw_body = await request.body()
        
        # Verify webhook signature
        if not verify_woocommerce_webhook(raw_body, signature, secret):
            print("❌ Invalid webhook signature")
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        print("✅ Signature verified")
        
        # Parse the JSON payload
        payload = await request.json()
        
        # Handle the event
        if topic:
            handle_woocommerce_event(topic, payload)
        
        # Respond with success
        return {"received": True}
        
    except HTTPException:
        # Re-raise HTTP exceptions (like 400 for invalid signature)
        raise
    except Exception as e:
        print(f"Error processing webhook: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "timestamp": "2024-01-15T10:30:00Z"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)