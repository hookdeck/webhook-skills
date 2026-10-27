# Setting Up PayNow Webhooks

## Prerequisites

- A PayNow store (paynow.gg) with access to its webhook settings
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI locally; see below)

## Register Your Endpoint

You can manage webhook subscriptions in the PayNow dashboard, or through the Management API ([Webhooks](https://docs.paynow.gg/management-api/webhooks/)). Each subscription needs:

| Parameter | Description |
|-----------|-------------|
| `event` | The event to subscribe to, such as `ON_ORDER_COMPLETED` |
| `url` | The full URL PayNow sends the `POST` request to |
| `type` | Payload format. Choose **JSON (v1)**; Discord (v1) posts to a Discord webhook URL instead |

Subscribe to the events your handler uses, for example `ON_ORDER_COMPLETED`, `ON_PAYMENT_COMPLETED`, `ON_PAYMENT_FAILED`, `ON_REFUND`, `ON_SUBSCRIPTION_RENEWED`, and `ON_DELIVERY_ITEM_ADDED`.

## Get Your Signing Secret

PayNow's docs refer to a signing secret but don't describe where it is shown. Find it on the webhook in the PayNow dashboard (or in the API response if you create the webhook programmatically) and store it as `PAYNOW_WEBHOOK_SECRET`. Use it exactly as shown: it is the HMAC key as UTF-8 text, not hex- or base64-decoded.

## Local Development

```bash
npx hookdeck-cli listen 3000 paynow-gg --path /webhooks/paynow-gg
```

Use port `8000` for FastAPI. Set the URL the CLI prints as the webhook URL in PayNow.

## Testing

Trigger a real event in a test store (for example, complete a low-value order or a test payment) and check the delivery in the Hookdeck web UI. Respond `2xx` quickly; a status above 299 is retried with exponential backoff.
