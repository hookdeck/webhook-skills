# Setting Up Crossmint Webhooks

## Prerequisites

- A Crossmint project (staging and production consoles are separate; set up each)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Add a Crossmint Webhook Endpoint?

1. Open the Webhooks page in the Crossmint console.
2. Click **Add Endpoint**.
3. Enter your endpoint URL, e.g. `https://example.com/webhooks/crossmint`.
4. Choose the event types to receive. An endpoint with no filter receives every event from every product.
5. Click **Create**.

No challenge or validation request is sent. The console also offers a "with Svix Play" option that inspects payloads without a server.

## Where Do I Find the Webhook Secret?

Open the endpoint's details in the console and look for the **Signing Secret** section. It looks like `whsec_xxxxxxxxxxxx`. Store the full value, prefix included:

```bash
CROSSMINT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The signing key is the base64-decoded part after `whsec_`. Each endpoint has its own secret. If the value doesn't start with `whsec_`, the examples answer 500 rather than verify with the wrong key.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 crossmint --path /webhooks/crossmint   # use 8000 for FastAPI
```

Add the printed URL as an endpoint in the staging console, then trigger an event: a staging wallet transfer for `wallets.transfer.in` / `wallets.transfer.out`, or a test checkout for `orders.*`.
