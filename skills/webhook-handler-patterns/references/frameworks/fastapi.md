# FastAPI Webhook Patterns

## Reading the Raw Body

FastAPI's `Request` object provides access to the raw request body for signature verification.

### Basic Pattern

```python
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()

@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    # Get raw body for signature verification
    raw_body = await request.body()
    
    # Get headers
    signature = request.headers.get("stripe-signature")
    
    # Verify and process...
    
    return {"received": True}
```

### Important: Read Body Once

The request body can only be read once. If you need both raw and parsed body:

```python
@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    # Read raw body first
    raw_body = await request.body()
    
    # Parse JSON manually after verification
    import json
    payload = json.loads(raw_body)
    
    # DON'T do this - body already consumed
    # body2 = await request.body()  # Returns empty bytes!
```

## Dependency Injection for Verification

Use FastAPI's dependency injection for clean verification:

### Pattern 1: Verification Dependency

```python
from fastapi import Depends, Header, HTTPException
import hmac
import hashlib
import os

async def verify_stripe_signature(
    request: Request,
    stripe_signature: str = Header(alias="stripe-signature")
) -> bytes:
    """Dependency that verifies Stripe signature and returns raw body."""
    raw_body = await request.body()
    
    # Parse signature header
    # Format: t=timestamp,v1=signature
    parts = dict(p.split("=") for p in stripe_signature.split(","))
    timestamp = parts.get("t")
    signature = parts.get("v1")
    
    if not timestamp or not signature:
        raise HTTPException(status_code=400, detail="Invalid signature format")
    
    # Compute expected signature
    secret = os.environ["STRIPE_WEBHOOK_SECRET"]
    signed_payload = f"{timestamp}.{raw_body.decode()}"
    expected = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    return raw_body

@app.post("/webhooks/stripe")
async def stripe_webhook(raw_body: bytes = Depends(verify_stripe_signature)):
    import json
    event = json.loads(raw_body)
    
    # Handle event...
    print(f"Received: {event['type']}")
    
    return {"received": True}
```

### Pattern 2: Reusable Verification Class

```python
from fastapi import Depends, Header, HTTPException, Request
import hmac
import hashlib
import base64

class WebhookVerifier:
    def __init__(self, secret_env_var: str, header_name: str, encoding: str = "hex"):
        self.secret_env_var = secret_env_var
        self.header_name = header_name
        self.encoding = encoding
    
    async def __call__(
        self,
        request: Request,
    ) -> bytes:
        raw_body = await request.body()
        signature = request.headers.get(self.header_name)
        
        if not signature:
            raise HTTPException(status_code=400, detail=f"Missing {self.header_name} header")
        
        secret = os.environ.get(self.secret_env_var)
        if not secret:
            raise HTTPException(status_code=500, detail="Webhook secret not configured")
        
        computed = hmac.new(secret.encode(), raw_body, hashlib.sha256)
        
        if self.encoding == "base64":
            expected = base64.b64encode(computed.digest()).decode()
        else:
            expected = computed.hexdigest()
        
        # Handle signature format variations
        received = signature.replace("sha256=", "")
        
        if not hmac.compare_digest(expected, received):
            raise HTTPException(status_code=401, detail="Invalid signature")
        
        return raw_body

# Create verifiers for different providers
verify_github = WebhookVerifier("GITHUB_WEBHOOK_SECRET", "x-hub-signature-256", "hex")
verify_shopify = WebhookVerifier("SHOPIFY_API_SECRET", "x-shopify-hmac-sha256", "base64")

@app.post("/webhooks/github")
async def github_webhook(raw_body: bytes = Depends(verify_github)):
    event = json.loads(raw_body)
    # Handle event...

@app.post("/webhooks/shopify")  
async def shopify_webhook(raw_body: bytes = Depends(verify_shopify)):
    event = json.loads(raw_body)
    # Handle event...
```

## Background Tasks

For long-running processing, use FastAPI's BackgroundTasks:

```python
from fastapi import BackgroundTasks

def process_event(event: dict):
    """Process webhook event (runs in background)."""
    event_type = event.get("type")
    
    if event_type == "payment_intent.succeeded":
        # Long-running operation
        fulfill_order(event["data"]["object"])
    
    # More processing...

@app.post("/webhooks/stripe")
async def stripe_webhook(
    background_tasks: BackgroundTasks,
    raw_body: bytes = Depends(verify_stripe_signature)
):
    event = json.loads(raw_body)
    
    # Add to background tasks
    background_tasks.add_task(process_event, event)
    
    # Return immediately
    return {"received": True}
```

### With Task Queues (Celery)

For production, use a proper task queue:

```python
from celery import Celery

celery_app = Celery("tasks", broker="redis://localhost:6379")

@celery_app.task
def process_webhook_task(event: dict):
    # Process in worker
    pass

@app.post("/webhooks/stripe")
async def stripe_webhook(raw_body: bytes = Depends(verify_stripe_signature)):
    event = json.loads(raw_body)
    
    # Queue for async processing
    process_webhook_task.delay(event)
    
    return {"received": True}
```

## Middleware Pattern

For logging and monitoring across all webhooks:

```python
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import time
import logging

logger = logging.getLogger(__name__)

class WebhookLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/webhooks/"):
            return await call_next(request)
        
        start_time = time.time()
        
        # Log incoming webhook
        logger.info(
            "Webhook received",
            extra={
                "path": request.url.path,
                "method": request.method,
                "headers": dict(request.headers),
            }
        )
        
        response = await call_next(request)
        
        duration = time.time() - start_time
        
        # Log result
        logger.info(
            "Webhook processed",
            extra={
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration * 1000,
            }
        )
        
        return response

app.add_middleware(WebhookLoggingMiddleware)
```

## Complete FastAPI Example

```python
import os
import json
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks, Depends, Header

load_dotenv()

app = FastAPI()


async def verify_stripe_signature(
    request: Request,
    stripe_signature: str = Header(alias="stripe-signature")
) -> bytes:
    """Verify Stripe webhook signature."""
    raw_body = await request.body()
    
    # Parse signature header
    parts = {}
    for part in stripe_signature.split(","):
        key, value = part.split("=", 1)
        parts[key] = value
    
    timestamp = parts.get("t")
    signature = parts.get("v1")
    
    if not timestamp or not signature:
        raise HTTPException(status_code=400, detail="Invalid signature format")
    
    # Compute expected signature
    secret = os.environ["STRIPE_WEBHOOK_SECRET"]
    signed_payload = f"{timestamp}.{raw_body.decode()}"
    expected = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    return raw_body


def process_payment_succeeded(payment_intent: dict):
    """Background task to process successful payment."""
    print(f"Processing payment: {payment_intent['id']}")
    # Fulfill order, send email, etc.


def process_subscription_created(subscription: dict):
    """Background task to process new subscription."""
    print(f"Processing subscription: {subscription['id']}")
    # Provision access, welcome email, etc.


@app.post("/webhooks/stripe")
async def stripe_webhook(
    background_tasks: BackgroundTasks,
    raw_body: bytes = Depends(verify_stripe_signature)
):
    event = json.loads(raw_body)
    event_type = event["type"]
    data_object = event["data"]["object"]
    
    print(f"Received {event_type} event: {event['id']}")
    
    # Route to appropriate handler
    if event_type == "payment_intent.succeeded":
        background_tasks.add_task(process_payment_succeeded, data_object)
    
    elif event_type == "customer.subscription.created":
        background_tasks.add_task(process_subscription_created, data_object)
    
    else:
        print(f"Unhandled event type: {event_type}")
    
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
```

## Testing FastAPI Webhooks

```python
# test_webhooks.py
from fastapi.testclient import TestClient
import hmac
import hashlib
import time
import os

from main import app

client = TestClient(app)


def generate_stripe_signature(payload: str, secret: str) -> str:
    timestamp = str(int(time.time()))
    signed_payload = f"{timestamp}.{payload}"
    signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def test_valid_webhook():
    payload = json.dumps({
        "id": "evt_test",
        "type": "payment_intent.succeeded",
        "data": {"object": {"id": "pi_test"}}
    })
    signature = generate_stripe_signature(
        payload,
        os.environ["STRIPE_WEBHOOK_SECRET"]
    )
    
    response = client.post(
        "/webhooks/stripe",
        content=payload,
        headers={
            "Content-Type": "application/json",
            "Stripe-Signature": signature,
        }
    )
    
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_invalid_signature():
    response = client.post(
        "/webhooks/stripe",
        content="{}",
        headers={
            "Content-Type": "application/json",
            "Stripe-Signature": "invalid",
        }
    )
    
    assert response.status_code == 401
```
