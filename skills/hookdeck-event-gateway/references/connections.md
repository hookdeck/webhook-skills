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

Sources are created inline when creating a connection. Use `upsert` for idempotent operations:

```bash
# Create connection with Stripe source (auto-creates source)
hookdeck connection upsert stripe-to-local \
  --source-type STRIPE \
  --source-name stripe-webhooks \
  --source-webhook-secret whsec_your_secret \
  --destination-type CLI \
  --destination-name local-dev

# Create connection with generic webhook source
hookdeck connection upsert generic-to-local \
  --source-type WEBHOOK \
  --source-name generic-webhooks \
  --destination-type CLI \
  --destination-name local-dev
```

## Destinations

Destinations define where events are delivered.

### Destination Types

| Type | Use Case |
|------|----------|
| `HTTP` | Your API endpoint |
| `CLI` | Local development via `hookdeck listen` |

### Creating Destinations

Destinations are created inline when creating a connection:

```bash
# HTTP destination
hookdeck connection upsert my-webhooks \
  --source-type WEBHOOK \
  --source-name my-source \
  --destination-type HTTP \
  --destination-name my-api \
  --destination-url https://api.example.com/webhooks

# With bearer token authentication
hookdeck connection upsert my-webhooks \
  --source-type WEBHOOK \
  --source-name my-source \
  --destination-type HTTP \
  --destination-name my-api \
  --destination-url https://api.example.com/webhooks \
  --destination-auth-method bearer \
  --destination-bearer-token "token123"

# CLI destination for local development
hookdeck connection upsert my-local \
  --source-type WEBHOOK \
  --source-name my-source \
  --destination-type CLI \
  --destination-name local-dev \
  --destination-cli-path /webhooks
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

Route events based on content using JSON filter syntax:

```bash
# Only allow specific event types (using --rules flag for complex filters)
hookdeck connection upsert my-connection \
  --rules '[{"type":"filter","body":{"type":{"$in":["payment_intent.succeeded","invoice.paid"]}}}]'

# Filter by header value
hookdeck connection upsert my-connection \
  --rules '[{"type":"filter","headers":{"x-shopify-topic":{"$startsWith":"order/"}}}]'
```

Filter operators:
- `$eq` - Equal (or deep equal)
- `$neq` - Not equal
- `$in` - Contains (for arrays/strings)
- `$nin` - Does not contain
- `$gt`, `$gte`, `$lt`, `$lte` - Comparison operators
- `$startsWith`, `$endsWith` - String matching
- `$or`, `$and` - Logical operators
- `$not` - Negation
- `$exist` - Check if field exists

> **Note:** For complex JSON filters, use the `--rules` flag with a full rules array. 
> See [Hookdeck Filters documentation](https://hookdeck.com/docs/filters) for full syntax.

### Transform Rule

Modify events before delivery using transformations:

```bash
# Apply a named transformation
hookdeck connection upsert my-connection \
  --rule-transform-name my-transform

# Create inline transformation code
hookdeck connection upsert my-connection \
  --rule-transform-code 'addHandler("transform", (request, context) => { request.headers["X-Custom"] = "value"; return request; })'
```

Transformations can modify:
- Headers
- Body
- Query parameters
- Path

See [Hookdeck Transformations](https://hookdeck.com/docs/transformations) for full transformation syntax.

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
# Deduplicate by specific fields with 1-hour window
hookdeck connection upsert my-connection \
  --rule-deduplicate-include-fields "body.id,body.type" \
  --rule-deduplicate-window 3600

# Deduplicate excluding certain fields
hookdeck connection upsert my-connection \
  --rule-deduplicate-exclude-fields "body.timestamp,headers.x-request-id" \
  --rule-deduplicate-window 3600
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
hookdeck connection upsert stripe-to-api \
  --source-type STRIPE \
  --source-name stripe \
  --destination-type HTTP \
  --destination-name api-server \
  --destination-url https://api.example.com/webhooks

# Connection to analytics (reuses existing source by name)
hookdeck connection upsert stripe-to-analytics \
  --source-type STRIPE \
  --source-name stripe \
  --destination-type HTTP \
  --destination-name analytics \
  --destination-url https://analytics.example.com/events

# Connection to notifications (with filter)
hookdeck connection upsert stripe-to-notifications \
  --source-type STRIPE \
  --source-name stripe \
  --destination-type HTTP \
  --destination-name notifications \
  --destination-url https://notify.example.com/webhooks \
  --rules '[{"type":"filter","body":{"type":"payment_intent.succeeded"}}]'
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
hookdeck connection upsert stripe-orders-to-fulfillment ...
hookdeck connection upsert shopify-products-to-inventory ...

# Bad: Generic names
hookdeck connection upsert conn1 ...
hookdeck connection upsert webhook ...
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
# Only payment events (using --rules flag)
--rules '[{"type":"filter","body":{"type":{"$startsWith":"payment_intent."}}}]'

# Only orders above $100 (amount in cents)
--rules '[{"type":"filter","body":{"data":{"object":{"amount":{"$gte":10000}}}}}]'
```

See [Hookdeck Filters](https://hookdeck.com/docs/filters) for full filter syntax and examples.

## Full Documentation

- [Hookdeck Connections](https://hookdeck.com/docs/connections)
- [Hookdeck Rules](https://hookdeck.com/docs/connections#connection-rules)
- [Hookdeck Filters](https://hookdeck.com/docs/filters)
- [Hookdeck Transformations](https://hookdeck.com/docs/transformations)
