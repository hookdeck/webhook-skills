# Setting Up Agentset Webhooks

## Prerequisites

- An Agentset organization where you can manage webhooks
- A public HTTPS URL for your endpoint (use the Hookdeck CLI for local development)

## Get Your Signing Secret

Each webhook has its own signing secret, shown in the webhook's **Update Details** tab. Store it as
`AGENTSET_WEBHOOK_SECRET`. Use it exactly as shown: the HMAC key is its UTF-8 bytes, not a decoded
hex or base64 value.

## Register Your Endpoint

1. In the Agentset dashboard open **Webhooks** (organization settings) and create a webhook.
2. Enter your endpoint URL, e.g. `https://example.com/webhooks/agentset`.
3. Choose the events to receive. Good starting set: `document.ready`, `document.error`,
   `ingest_job.ready`, `ingest_job.error`.
4. Optionally restrict it to specific namespaces.
5. Copy the signing secret from **Update Details**.

## Local Development

```bash
npx hookdeck-cli listen 3000 agentset --path /webhooks/agentset
```

Use the printed URL as the webhook URL.

## Using Hookdeck

Hookdeck's Agentset source verifies the `agentset-signature` header. It pre-selects POST without
managing the HTTP method, because Agentset's docs don't name one. If Agentset sends any other
method, allow that method on the source too. Paste the same signing secret into the source.

## Delivery Behavior

Return 2xx within 20 seconds. Failures are retried up to 10 times (exponential backoff, capped at
24 h). After 5, 10 and 15 consecutive failures the owners get an email, and the 20th disables the
webhook, so fix 401s (a wrong secret) promptly.
