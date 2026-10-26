# Setting Up Basin Webhooks

## Prerequisites

- A Basin form
- **Growth plan or above** for signed webhooks (lower plans deliver unsigned requests)
- Your endpoint URL

## Register Your Endpoint

1. Open your form dashboard > **Integrations** > **Webhooks**.
2. Enter your endpoint URL, choose the payload type (JSON, data wrapped JSON, form URL encoded...) and save.
3. Optionally tick the checkbox to also fire webhooks for spam-flagged submissions.

## Get Your Signing Secret

1. Integrations > Webhooks > **Edit** > **Webhook Signing** > **Show**.
2. Store it as `BASIN_WEBHOOK_SECRET`. Treat it like a password.
3. If compromised, click **Regenerate Secret**. Basin signs with the new secret immediately, so update your endpoint first.

## Setup with Hookdeck

Basin signs webhooks only on the Growth plan and above: paste the webhook signing secret into the
Hookdeck source's webhook verification settings. On lower plans, deliveries are unsigned and fail
verification.

## Local Development

```bash
npx hookdeck-cli listen 3000 basin --path /webhooks/basin
```

## Testing

Submit your form, or use **Re-fire Webhook** in a submission's Log view (also available in bulk
from the Submissions inbox, or via `POST /api/v1/submissions/{id}/refire_webhooks`).
