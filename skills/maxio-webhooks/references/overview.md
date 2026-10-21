# Maxio Webhooks Overview

## What Are Maxio Webhooks?

Maxio (formerly Chargify) sends an HTTP POST to your endpoint when billing events happen on your site, such as signups, payments, renewals and subscription state changes. The body is form-encoded (`application/x-www-form-urlencoded`), not JSON.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `signup_success` | A customer signs up | Provision accounts, send welcome email |
| `payment_success` | A payment succeeds | Mark invoices paid, grant access |
| `payment_failure` | A payment attempt fails | Start dunning, notify customer |
| `renewal_success` | A subscription renews | Extend entitlements |
| `subscription_state_change` | A subscription changes state | Sync status (active, canceled, etc.) |
| `test` | You send a test from the Maxio UI | Verify your endpoint |

Maxio offers additional webhook event types; see the official documentation for the full list.

## Request Format

```
POST /webhooks/maxio
Content-Type: application/x-www-form-urlencoded
X-Chargify-Webhook-Signature-Hmac-Sha-256: <hex digest>

payload[chargify]=testing&event=test
```

- `event` — the event name.
- `payload[...]` — nested fields describing the event (bracket notation). Inspect real deliveries in the Hookdeck CLI web UI to see the exact fields for each event.

## Full Event Reference

See [Maxio's webhook documentation](https://support.maxio.com/hc/en-us/articles/24266136649869-Webhooks-Configuration-and-Testing).
