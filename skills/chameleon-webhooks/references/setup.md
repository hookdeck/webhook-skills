# Setting Up Chameleon Webhooks

## Prerequisites

- A Chameleon account with permission to manage integrations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 chameleon --path /webhooks/chameleon` locally)

## Get Your Webhook Secret

1. Open the Chameleon dashboard at app.chameleon.io.
2. Go to **Integrations** -> **Webhooks** (app.chameleon.io/integrations/webhooks).
3. Copy your account's **Webhook Secret** and store it as an environment variable:

```bash
CHAMELEON_WEBHOOK_SECRET=your_webhook_secret
```

Use the value exactly as shown. It is the HMAC key as UTF-8 text, not hex or base64 to decode.

## Register Your Endpoint

1. On the Webhooks page, add an endpoint with your `https://` URL, e.g. `https://example.com/webhooks/chameleon`.
2. Select the topics you want to receive, e.g. `tour.completed`, `survey.completed`, `response.finished`.
3. Save. Chameleon sends `ping` events to check the endpoint is healthy, so verify and acknowledge
   them with a `200`.

The endpoint must accept `POST` and answer with a 2xx within 7 seconds. Anything else is retried
9 times over 43 hours.

## Optional: IP Allowlist

Chameleon's docs recommend accepting requests only from Chameleon IP addresses. Take the current
list from the Chameleon documentation and apply it at your firewall, in addition to verifying the signature.

## Test

Chameleon's docs have a Testing Webhooks guide. Locally, `npx hookdeck-cli listen` forwards live
deliveries to your machine, and the example tests sign their own requests, so no account is needed.
