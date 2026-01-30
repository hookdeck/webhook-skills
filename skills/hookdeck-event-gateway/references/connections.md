# Hookdeck Connections Reference

## Connection Model

A connection routes events from a **source** to a **destination** with optional rules.

```
┌─────────────┐     ┌─────────────────────────────────┐     ┌─────────────────┐
│   Source    │────▶│          Connection             │────▶│   Destination   │
│             │     │  ┌─────────────────────────┐    │     │                 │
│  - Name     │     │  │        Rules            │    │     │  - Name         │
│  - Type     │     │  │  - Retry                │    │     │  - URL          │
│  - Verify   │     │  │  - Filter               │    │     │  - Auth         │
│             │     │  │  - Transform            │    │     │                 │
└─────────────┘     │  │  - Delay                │    │     └─────────────────┘
                    │  │  - Deduplicate          │    │
                    │  └─────────────────────────┘    │
                    └─────────────────────────────────┘
```

## Sources

Sources define where webhooks come from and how to verify them.

### Source Types

| Type | Provider | Verification |
|------|----------|--------------|
| `STRIPE` | Stripe | HMAC SHA-256 with timestamp |
| `SHOPIFY` | Shopify | HMAC SHA-256, base64 |
| `GITHUB` | GitHub | HMAC SHA-256, hex |
| `WEBHOOK` | Generic | Optional HMAC |

### Creating Sources

```bash
# Source with verification
hookdeck source create stripe \
  --type STRIPE \
  --verification-secret whsec_your_secret

# Generic source
hookdeck source create generic-webhooks \
  --type WEBHOOK
```

## Destinations

Destinations define where events are delivered.

### Destination Types

| Type | Use Case |
|------|----------|
| `HTTP` | Your API endpoint |
| `CLI` | Local development via `hookdeck listen` |

### Creating Destinations

```bash
# HTTP destination
hookdeck destination create my-api \
  --url https://api.example.com/webhooks

# With authentication
hookdeck destination create my-api \
  --url https://api.example.com/webhooks \
  --auth-header "Authorization: Bearer token123"
```

## Connection Rules

Rules control how events flow through a connection.

### Retry Rule

Configure automatic retries for failed deliveries:

```bash
hookdeck connection upsert my-connection \
  --rule-retry-strategy exponential \
  --rule-retry-interval 60000 \
  --rule-retry-count 5 \
  --rule-retry-response-status-codes "429,500,502,503,504"
```

| Setting | Description |
|---------|-------------|
| `strategy` | `linear` or `exponential` |
| `interval` | Delay between retries (ms) |
| `count` | Maximum retry attempts |
| `response-status-codes` | HTTP codes that trigger retry |

### Filter Rule

Route events based on content:

```bash
# Only allow specific event types
hookdeck connection upsert my-connection \
  --rule-filter '{"body.type": {"$in": ["payment_intent.succeeded", "invoice.paid"]}}'
```

Filter operators:
- `$eq` - Equal
- `$ne` - Not equal
- `$in` - In array
- `$nin` - Not in array
- `$contains` - Contains string
- `$regex` - Regex match

### Transform Rule

Modify events before delivery:

```bash
# Add custom header
hookdeck connection upsert my-connection \
  --rule-transform '{"headers": {"X-Custom": "value"}}'
```

Transformations can modify:
- Headers
- Body
- Query parameters
- Path

### Delay Rule

Add delay before delivery:

```bash
# Delay all events by 5 seconds
hookdeck connection upsert my-connection \
  --rule-delay 5000
```

### Deduplicate Rule

Prevent duplicate event processing:

```bash
# Deduplicate by event ID
hookdeck connection upsert my-connection \
  --rule-deduplicate '{"key": "body.id", "window": 3600}'
```

## One-to-Many Delivery

Route events from one source to multiple destinations:

```
                    ┌─ Connection 1 ─▶ API Server
Source (Stripe) ────┼─ Connection 2 ─▶ Analytics
                    └─ Connection 3 ─▶ Notifications
```

Create multiple connections with the same source:

```bash
# Connection to API
hookdeck connection create stripe-to-api \
  --source-name stripe \
  --destination-name api-server

# Connection to analytics
hookdeck connection create stripe-to-analytics \
  --source-name stripe \
  --destination-name analytics

# Connection to notifications (with filter)
hookdeck connection create stripe-to-notifications \
  --source-name stripe \
  --destination-name notifications \
  --rule-filter '{"body.type": {"$in": ["payment_intent.succeeded"]}}'
```

## Managing Connections

### List Connections

```bash
hookdeck connection list
```

### Pause/Resume

```bash
# Pause a connection
hookdeck connection pause my-connection

# Resume a connection
hookdeck connection unpause my-connection
```

### Delete

```bash
hookdeck connection delete my-connection
```

## Best Practices

### Use Meaningful Names

```bash
# Good: Descriptive names
hookdeck connection create stripe-orders-to-fulfillment
hookdeck connection create shopify-products-to-inventory

# Bad: Generic names
hookdeck connection create conn1
hookdeck connection create webhook
```

### Configure Appropriate Retries

Match retry settings to your use case:

```bash
# Critical payments: More retries, shorter intervals
--rule-retry-strategy exponential \
--rule-retry-interval 30000 \
--rule-retry-count 10

# Non-critical analytics: Fewer retries
--rule-retry-strategy linear \
--rule-retry-interval 300000 \
--rule-retry-count 3
```

### Use Filters to Reduce Noise

Only forward events you care about:

```bash
# Only payment events
--rule-filter '{"body.type": {"$regex": "^payment_intent\\."}}'

# Only orders above $100
--rule-filter '{"body.data.object.amount": {"$gte": 10000}}'
```

## Full Documentation

- [Hookdeck Connections](https://hookdeck.com/docs/connections)
- [Hookdeck Rules](https://hookdeck.com/docs/connections#connection-rules)
- [Hookdeck Filters](https://hookdeck.com/docs/filters)
- [Hookdeck Transformations](https://hookdeck.com/docs/transformations)
