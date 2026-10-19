# Setting Up Revolut Webhooks

## Prerequisites

- A Revolut Merchant account (sandbox or production)
- Your Merchant API **secret key** (used to authenticate Merchant API calls)
- Your application's HTTPS webhook endpoint URL

Revolut webhooks are configured **via the Merchant API only** — there is no
dashboard switch. You create a webhook by making an authenticated API request,
and the response contains the **signing secret** you use to verify deliveries.

## API Hosts

| Environment | Merchant API host |
|-------------|-------------------|
| Sandbox | `https://sandbox-merchant.revolut.com` |
| Production | `https://merchant.revolut.com` |

Authenticate with your Merchant API secret key using a Bearer token, and send
the `Revolut-Api-Version` header (a date, e.g. `2024-09-01`).

## Create a Webhook

```bash
curl -X POST https://sandbox-merchant.revolut.com/api/webhooks \
  -H "Authorization: Bearer $REVOLUT_SECRET_KEY" \
  -H "Revolut-Api-Version: 2024-09-01" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/revolut",
    "events": [
      "ORDER_COMPLETED",
      "ORDER_AUTHORISED",
      "ORDER_CANCELLED",
      "ORDER_PAYMENT_AUTHENTICATED",
      "ORDER_PAYMENT_DECLINED",
      "ORDER_PAYMENT_FAILED"
    ]
  }'
```

`events` is typed as an array of enum, so use the documented names verbatim. The
six above are a common starting subset; the full 23-type list is in
[overview.md](overview.md#full-event-reference), mirroring the enum on the
[Create a webhook](https://developer.revolut.com/docs/merchant/create-webhook)
operation.

The response includes the webhook `id` and a **`signing_secret`** that starts
with `wsk_`:

```json
{
  "id": "wh_9pJg2Fk9r...",
  "url": "https://your-app.com/webhooks/revolut",
  "events": ["ORDER_COMPLETED", "ORDER_AUTHORISED"],
  "signing_secret": "wsk_r59a4HfWaQ5j8..."
}
```

> Store `signing_secret` securely as `REVOLUT_SIGNING_SECRET`. It is only
> returned on creation and on retrieval — treat it like a password.

## Get / Rotate the Signing Secret

- **Retrieve** an existing webhook (including its signing secret):
  `GET /api/webhooks/{webhook_id}`
- **Rotate** the signing secret:
  `POST /api/webhooks/{webhook_id}/rotate-signing-secret`

During rotation, Revolut may sign a delivery with both the old and new secrets,
so the `Revolut-Signature` header can contain **multiple comma-separated
signatures**. Verify by accepting the request if **any** signature matches — the
example handlers in this skill do this.

## Limits and Notes

- Up to **10 webhook URLs** per merchant account.
- The current endpoints live at `/api/webhooks` (verified against the live
  Merchant API reference) and require the `Revolut-Api-Version` header. The
  legacy `POST /api/1.0/webhooks` path is deprecated.
- The Revolut **Business API** has a separate webhook system that uses the same
  `v1` signature scheme.

## Test Mode vs Live Mode

Create and test webhooks against `sandbox-merchant.revolut.com` first. Sandbox
and production have separate credentials and separate signing secrets — a secret
from one environment will never verify traffic from the other.

## Verify the Signature

Every delivery is signed. Never trust a webhook you have not verified. See
[verification.md](verification.md) for the exact algorithm and framework code.
