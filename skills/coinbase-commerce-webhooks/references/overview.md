# Coinbase Commerce Webhooks Overview

## What Are Coinbase Commerce Webhooks?

[Coinbase Commerce](https://commerce.coinbase.com/) lets merchants accept
cryptocurrency payments. A **charge** represents a request for payment. As a
charge moves through its lifecycle (created → pending → confirmed, or failed),
Coinbase Commerce sends an HTTP `POST` webhook to your configured endpoint so
your backend can react in real time — fulfilling orders, updating balances, or
notifying customers.

Every webhook request is signed with an HMAC-SHA256 signature in the
`X-CC-Webhook-Signature` header so you can verify it genuinely came from
Coinbase Commerce.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `charge:created` | A new charge is created | Log the pending order, start a payment timer |
| `charge:pending` | Customer paid; payment detected on-chain but not yet confirmed | Show "payment received, confirming" state |
| `charge:confirmed` | Payment confirmed — the charge is complete | Fulfill the order, grant access, send receipt |
| `charge:failed` | The charge failed or expired without full payment | Cancel the order, notify the customer |
| `charge:delayed` | Payment arrived after expiry, or was underpaid/overpaid | Flag for manual review, issue partial fulfillment |
| `charge:resolved` | A previously delayed charge has been resolved | Complete or refund based on the resolution |

## Event Payload Structure

The event object is **nested under the top-level `event` key**:

```json
{
  "id": "24934862-d980-46cb-9402-43c81b0cabd5",
  "scheduled_for": "2018-05-31T19:03:16Z",
  "event": {
    "id": "053b96aa-868f-4d8f-8ac6-6b96644da340",
    "resource": "event",
    "type": "charge:confirmed",
    "api_version": "2018-03-22",
    "created_at": "2023-08-30T19:29:20Z",
    "data": {
      "id": "2aee9dd1-67b8-43ef-8dfe-977959850f27",
      "code": "XA6G6ZFR",
      "name": "Order #1234",
      "description": "T-shirt",
      "pricing": {
        "local": { "amount": "20.00", "currency": "USD" }
      },
      "metadata": { "order_id": "1234" },
      "timeline": [
        { "status": "NEW", "time": "2023-08-30T19:20:00Z" },
        { "status": "COMPLETED", "time": "2023-08-30T19:29:20Z" }
      ]
    }
  }
}
```

Key fields on the `event` object:

| Field | Description |
|-------|-------------|
| `id` | Unique event ID (use for idempotency) |
| `resource` | Always `"event"` |
| `type` | The event type, e.g. `charge:confirmed` |
| `api_version` | Coinbase Commerce API version, e.g. `2018-03-22` |
| `created_at` | ISO 8601 timestamp |
| `data` | The charge object (`id`, `code`, `pricing`, `metadata`, `timeline`, ...) |

The charge's `timeline` array records status transitions (`NEW`, `PENDING`,
`COMPLETED`, `EXPIRED`, `UNRESOLVED`, `RESOLVED`), which is often more precise
than the event `type` for deciding what to do.

## Full Event Reference

For the complete list of events and payload fields, see the
[Coinbase Commerce webhooks documentation](https://docs.cdp.coinbase.com/commerce/api-arcitecture/webhooks-fields).
