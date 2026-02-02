---
name: chargebee-webhooks
description: >
  Receive and verify Chargebee webhooks. Use when setting up Chargebee webhook
  handlers, debugging Basic Auth verification, or handling subscription billing events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Chargebee Webhooks

## When to Use This Skill

- Setting up Chargebee webhook handlers
- Debugging Basic Auth verification failures
- Understanding Chargebee event types and payloads
- Processing subscription billing events

## Essential Code

Chargebee uses Basic Authentication for webhook verification. Here's how to implement it:

### Express.js

```javascript
// Verify Chargebee webhook with Basic Auth
app.post('/webhooks/chargebee', express.json(), (req, res) => {
  // Extract Basic Auth credentials
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  // Decode and verify credentials
  const encoded = auth.substring(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  const expectedUsername = process.env.CHARGEBEE_WEBHOOK_USERNAME;
  const expectedPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).send('Invalid credentials');
  }

  // Process the webhook
  const event = req.body;
  console.log(`Received ${event.event_type} event:`, event.id);

  // Handle specific event types
  switch (event.event_type) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_cancelled':
      // Process subscription events
      break;
    case 'payment_succeeded':
    case 'payment_failed':
      // Process payment events
      break;
  }

  res.status(200).send('OK');
});
```

### Next.js (App Router)

```typescript
// app/webhooks/chargebee/route.ts
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  // Extract Basic Auth credentials
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Decode and verify credentials
  const encoded = auth.substring(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  const expectedUsername = process.env.CHARGEBEE_WEBHOOK_USERNAME;
  const expectedPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;

  if (username !== expectedUsername || password !== expectedPassword) {
    return new Response('Invalid credentials', { status: 401 });
  }

  // Process the webhook
  const event = await req.json();
  console.log(`Received ${event.event_type} event:`, event.id);

  return new Response('OK', { status: 200 });
}
```

### FastAPI

```python
# main.py
from fastapi import FastAPI, Header, HTTPException, Depends
from typing import Optional
import base64
import os

app = FastAPI()

def verify_chargebee_auth(authorization: Optional[str] = Header(None)):
    """Verify Chargebee webhook Basic Auth"""
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Decode credentials
    encoded = authorization[6:]
    decoded = base64.b64decode(encoded).decode('utf-8')
    username, password = decoded.split(':', 1)

    expected_username = os.getenv("CHARGEBEE_WEBHOOK_USERNAME")
    expected_password = os.getenv("CHARGEBEE_WEBHOOK_PASSWORD")

    if username != expected_username or password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return True

@app.post("/webhooks/chargebee")
async def handle_chargebee_webhook(
    event: dict,
    auth_valid: bool = Depends(verify_chargebee_auth)
):
    """Handle Chargebee webhook events"""
    event_type = event.get("event_type")
    print(f"Received {event_type} event: {event.get('id')}")

    # Process event based on type
    if event_type in ["subscription_created", "subscription_updated", "subscription_cancelled"]:
        # Handle subscription events
        pass
    elif event_type in ["payment_succeeded", "payment_failed"]:
        # Handle payment events
        pass

    return {"status": "OK"}
```

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscription_created` | New subscription is created | Provision access, send welcome email |
| `subscription_updated` | Subscription is modified | Update user permissions, sync changes |
| `subscription_cancelled` | Subscription is cancelled | Revoke access, trigger retention flow |
| `subscription_reactivated` | Cancelled subscription is reactivated | Restore access, send notification |
| `payment_succeeded` | Payment is successful | Update payment status, send receipt |
| `payment_failed` | Payment fails | Retry payment, notify customer |
| `invoice_generated` | Invoice is created | Send invoice to customer |
| `customer_created` | New customer is created | Create user account, sync data |

## Environment Variables

```bash
# Chargebee webhook Basic Auth credentials
CHARGEBEE_WEBHOOK_USERNAME=your_webhook_username
CHARGEBEE_WEBHOOK_PASSWORD=your_webhook_password
```

## Local Development

For local webhook testing, use Hookdeck CLI:

```bash
brew install hookdeck/hookdeck/hookdeck
hookdeck listen 3000 --path /webhooks/chargebee
```

No account required. Provides local tunnel + web UI for inspecting requests.

## Reference Materials

- [Overview](references/overview.md) - What Chargebee webhooks are, common event types
- [Setup](references/setup.md) - Configure webhooks in Chargebee dashboard
- [Verification](references/verification.md) - Basic Auth verification details and gotchas

## Examples

- [Express Example](examples/express/) - Complete Express.js implementation with tests
- [Next.js Example](examples/nextjs/) - Next.js App Router implementation with tests
- [FastAPI Example](examples/fastapi/) - Python FastAPI implementation with tests

## Related Skills

- `webhook-handler-patterns` - Cross-cutting patterns (idempotency, retries, framework guides)
- `hookdeck-event-gateway` - Production infrastructure (routing, replay, monitoring)