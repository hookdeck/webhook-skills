# Setting Up Infinite Giving Webhooks

> Infinite Giving webhooks are for integration partners. Paste the signing secret Infinite Giving gives you at partner kickoff.

## Prerequisites

- An Infinite Giving integration partnership (partner onboarding with Infinite Giving)
- A publicly reachable HTTPS endpoint for your webhook URL

## Get Your Signing Secret

1. Infinite Giving provides the signing secret at partner kickoff.
2. Store it as `INFINITE_GIVING_WEBHOOK_SECRET`. It is used as-is, as UTF-8 text (do not hex- or base64-decode it).

## Register Your Endpoint

Webhook setup (OAuth + connect) is covered in Infinite Giving's Partnerships documentation (see the [webhooks overview](https://docs.infinitegiving.com/guide/webhooks/overview)). Once an organization connects, Infinite Giving sends `donation:created` and `donation:updated` events to your webhook URL.

For local development, expose your handler with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 infinite-giving --path /webhooks/infinite-giving
```

Use port `8000` for the FastAPI example.

## Using Hookdeck

Create an **Infinite Giving** source in Hookdeck and paste the signing secret there. Hookdeck verifies `X-IG-Signature` before forwarding to your destination.

## Testing

The docs describe no sandbox or test-event button. Replay the sample payloads from the [webhooks overview](https://docs.infinitegiving.com/guide/webhooks/overview) signed with your secret, as the example tests do.
