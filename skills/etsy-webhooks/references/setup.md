# Setting Up Etsy Webhooks

## Prerequisites

- An Etsy app registered in the [Etsy Developer Portal](https://www.etsy.com/developers/your-apps) (commercial or personal)
- A valid OAuth 2.0 access token with the scopes your app needs (for example `transactions_r` to read receipts, `listings_r` to read listings), so you can call each event's `resource_url`
- A publicly accessible HTTPS URL that accepts POST requests

## How Do I Open the Etsy Webhook Portal?

1. Go to **Manage your apps** in the Etsy Developer Portal.
2. Open the dropdown menu for your app and select **Go to Webhook portal**.

## How Do I Register a Webhook Endpoint?

1. In the Webhook portal, click **+ Add Endpoint**.
2. Enter your callback URL, e.g. `https://example.com/webhooks/etsy`.
3. Select the events to subscribe to. A typical shop integration starts with:
   - `order.paid`, `order.shipped`, `order.canceled`, `order.delivered`
   - `listing.updated`
   - `inventory.updated`, `inventory.out_of_stock`
4. Click **Create**.

## Where Do I Find the Etsy Signing Secret?

1. In the Webhook portal, click the endpoint you created.
2. The endpoint details show the **signing secret** (masked by default). Reveal and copy it.
3. Store it as an environment variable:

```bash
ETSY_WEBHOOK_SECRET=whsec_xxxxx
```

The secret starts with `whsec_`. The part after the prefix is base64; your verification code decodes it to get the HMAC key. Each endpoint has its own secret.

## How Do I Test Etsy Webhooks Locally?

Expose your local server with the Hookdeck CLI (no account required):

```bash
# Express or Next.js
npx hookdeck-cli listen 3000 etsy --path /webhooks/etsy

# FastAPI
npx hookdeck-cli listen 8000 etsy --path /webhooks/etsy
```

Use the printed URL as your endpoint URL in the Webhook portal, then:

1. Click the endpoint and open the **Testing** tab.
2. Choose an event type and send a test event.
3. Check that your handler returns 200 and that verification passed.

## How Do I Monitor and Replay Deliveries?

Each endpoint's detail view shows delivery stats, every message attempt, and the payload sent. From there you can:

- Manually retry a single message
- **Recover** all failed messages from a given date
- **Disable Endpoint** (via the three-dot menu) to pause deliveries; re-enable it the same way
- **Delete** the endpoint (permanent; all its data is removed)

Disabling or deleting an endpoint also stops any pending retries to it.
