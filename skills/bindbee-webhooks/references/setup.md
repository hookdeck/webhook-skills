# Setting Up Bindbee Webhooks

## Prerequisites

- A Bindbee account
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI during development)

## Version 2 only

Hookdeck's configuration alert for this source reads: "Paste the security signature secret as-is. Only version 2 webhooks are supported; version 1 webhooks lack the webhook-* headers and fail verification."

Create the webhook as **version 2** (`2026.10.06`). Version 1 (`2025.01.01`, deprecated December 31, 2026) deliveries have no `webhook-*` headers and cannot be verified with this skill.

## Get Your Signing Secret

1. Open the **Webhooks** page in the Bindbee dashboard.
2. Find the **Security signature** card.
3. Copy the secret. There is one organization-wide secret, used for every webhook on both versions. It has no prefix: paste it as-is into `BINDBEE_WEBHOOK_SECRET`.

Regenerating the secret invalidates the old one immediately, so update your environment (or Hookdeck source) at the same time.

## Register Your Endpoint

1. On the Webhooks page, create a webhook with your endpoint URL.
2. Choose version 2 and an environment: production, development or both.
3. Subscribe to events by exact name (no wildcards), for example `connector.linked`, `connector.sync.completed`, `connector.sync.failed`, `connector.relink_needed` and `hris.employee.created`.

No challenge or handshake is documented, so your endpoint only needs to verify the signature and return `200`.

## Local Development

```bash
npx hookdeck-cli listen 3000 bindbee --path /webhooks/bindbee
```

Use the URL the CLI prints as the webhook URL. Use port `8000` for FastAPI.

## Production and Test Environments

Webhooks are scoped to production, development or both. Use separate endpoints (or check `connector`) if you need to tell them apart.
