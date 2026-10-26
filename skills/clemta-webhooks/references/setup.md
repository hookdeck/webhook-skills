# Setting Up Clemta Webhooks

## Prerequisites

- A Clemta partner account (use a `clmt_test_` key while developing; it never touches live data)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Create a Clemta Webhook Endpoint?

Endpoints are managed from the **Webhooks page of the partner dashboard**.

1. Open the Webhooks page.
2. Create an endpoint with your URL, e.g. `https://example.com/webhooks/clemta`.
3. Optionally restrict it to some event types and pin its payloads to an API version.
4. Copy the signing secret now. It is shown once.

No challenge or validation request is documented, so the endpoint doesn't need to answer anything before it is saved.

## Where Do I Find the Signing Secret?

Every endpoint has its own signing secret, `whsec_...`, shown once at creation. Store the full value, prefix included:

```bash
CLEMTA_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The signing key is the base64-decoded part after `whsec_`. A delivery for one endpoint cannot be verified with another endpoint's secret. Each endpoint also has an Ed25519 keypair whose public half (`whpk_...`) is readable on the endpoint at any time; see [verification.md](verification.md) if you would rather verify without a shared secret.

## How Do I Rotate the Secret?

Roll the secret from the Webhooks page. The dashboard asks you to confirm with a one-time code emailed to you. A roll runs with an overlap: deliveries carry two `v1,` signatures, one per secret, and either verifies. Switch `CLEMTA_WEBHOOK_SECRET` to the new value during the overlap and the old one retires on its own.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 clemta --path /webhooks/clemta   # use 8000 for FastAPI
```

Use the printed URL as the endpoint URL. Create a test company with a `clmt_test_` key to generate events; test companies don't advance on their own, so drive them with `POST /sandbox/companies/{id}/simulate`. The dashboard also lets you inspect the last 30 days of deliveries and retry a single stuck delivery or a whole backlog.

## Managing Endpoints

- **Disable** an endpoint to pause deliveries (queued ones are held). **Enable** it again to resume with the same id, secret and key.
- A manual disable, a `410` response, and an automatic disable all re-enable the same way.
