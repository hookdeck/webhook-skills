# Setting Up Flagsmith Webhooks

## Prerequisites

- Flagsmith account (Cloud or self-hosted) with permission to manage the project/organisation
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 flagsmith --path /webhooks/flagsmith` locally)

## Choose the Webhook Type

| Type | Where to add it |
|------|-----------------|
| Environment (flag changes) | Environment **Settings** → **Webhooks** |
| Audit log | **Organisation settings** → **Webhooks** |
| Identity | Project **Integrations** → **Webhook** |

Menu labels can differ between Flagsmith versions; the docs describe the audit log one as "organisation settings" and the identity one as "add the integration". Check your dashboard.

## Set the Secret

1. When adding the webhook, enter the URL of your endpoint.
2. Fill in the optional **Secret** with a long random string you generate (for example `openssl rand -hex 32`). Flagsmith does not generate it for you.
3. Store the same string as `FLAGSMITH_WEBHOOK_SECRET` in your app.

If you leave the secret empty, Flagsmith sends **no** `X-Flagsmith-Signature` header and requests can't be verified.

## Test

Environment webhooks let you send a sample payload from the dashboard; otherwise toggle a flag to trigger `FLAG_UPDATED`. Identity webhooks fire when an SDK calls Get Identity Flags.

## Delivery

Flagsmith POSTs `application/json` with a 10 second timeout, retries on connection errors with backoff, and doesn't follow redirects. Respond with a fast 2xx.
