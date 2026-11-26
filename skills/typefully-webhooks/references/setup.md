# Setting Up Typefully Webhooks

## Prerequisites

- A Typefully account with API access
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI while developing)

Typefully's API documentation describes the events, payload and signature. Its [help center](https://support.typefully.com/en/articles/8718287-typefully-api) says to configure webhook URLs in **Settings → API** by clicking **+ Add webhook**. The public API has no endpoint for creating webhooks, and neither page says where the secret is shown.

## Get Your Webhook Secret

1. Open **Settings → API** in Typefully.
2. Click **+ Add webhook** (or open the existing webhook) and copy its secret.
3. Store it as `TYPEFULLY_WEBHOOK_SECRET`. The examples use the string as-is (UTF-8); don't decode it.

## Register Your Endpoint

1. Add your URL, for example `https://your-app.example.com/webhooks/typefully`.
2. Choose the events to receive: `draft.created`, `draft.planned`, `draft.scheduled`, `draft.published`, `draft.status_changed`, `draft.tags_changed`, `draft.deleted`. Any combination works.
3. Typefully sends `POST` requests with a JSON body and the `X-Typefully-*` headers.

## Local Development

```bash
npx hookdeck-cli listen 3000 typefully --path /webhooks/typefully
```

Use the printed Hookdeck URL as the webhook URL in Typefully. Use port `8000` for the FastAPI example.

## After a Failure

If your endpoint returns non-2xx 100 times in a row, Typefully disables the webhook and emails you. Fix the endpoint, then re-enable it from your API settings.
