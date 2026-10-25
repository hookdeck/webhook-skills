# Setting Up Meilisearch Webhooks

## Prerequisites

- A Meilisearch Cloud project, or a self-hosted Meilisearch instance
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Choose Your Authorization Header

Pick a long random secret. Meilisearch sends the header exactly as you set it, so decide on
the full value now, for example:

```
Bearer 9f2c7d1e4b8a4c36a1d05e7b3c9f8a21
```

Store the **whole value, including any `Bearer ` or `Basic ` prefix**, as
`MEILISEARCH_AUTHORIZATION`. In Hookdeck's Meilisearch source, paste the Authorization header
value exactly as set in Meilisearch, including any "Bearer " or "Basic " prefix.

## Meilisearch Cloud

1. Go to **Project Settings > Webhooks** and click **+ Add webhook**.
2. Enter the **Webhook URL** (for example `https://example.com/webhooks/meilisearch`).
3. Optionally enter an **Authorization Header** (for example `Bearer your-secret-token`).
   Always set one.
4. Click **Add webhook**. Up to 20 webhooks per project.

## Self-Hosted

Start Meilisearch with the task webhook flags (or `MEILI_TASK_WEBHOOK_URL` and `MEILI_TASK_WEBHOOK_AUTHORIZATION_HEADER`):

```bash
meilisearch \
  --task-webhook-url https://example.com/webhooks/meilisearch \
  --task-webhook-authorization-header "Bearer your-secret-token"
```

You can also manage webhooks with the `/webhooks` API (list, get, create, update, delete).
Set the header in the webhook's `headers` object:

```bash
curl -X POST "$MEILISEARCH_URL/webhooks" \
  -H "Authorization: Bearer $MEILISEARCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/webhooks/meilisearch","headers":{"Authorization":"Bearer your-secret-token"}}'
```

Check the [webhooks API reference](https://www.meilisearch.com/docs/reference/api/webhooks/create-webhook)
for the exact request shape of your Meilisearch version.

Notes from the self-hosting docs: `GET /webhooks` redacts the `Authorization` value, so keep the
original secret and resend it explicitly when you patch a webhook (never re-send the redacted
value). If your receiver is on a private network you may also need
`--experimental-allowed-ip-networks`.

## Local Testing

```bash
npx hookdeck-cli listen 3000 meilisearch --path /webhooks/meilisearch
```

Use the printed URL as the webhook URL. For FastAPI, use port `8000`. Hookdeck stores gzip
bodies as binary, so events show a binary body in the dashboard; it forwards the original
bytes and the `Content-Encoding` header, so your handler sees what Meilisearch sent.

## Testing

Trigger a task (for example add a document to an index) and watch the request arrive. Your
`/webhooks/meilisearch` endpoint must return `2xx`. Meilisearch Cloud retries failures with
exponential backoff; a self-hosted instance sends once (30-second timeout) and does not retry.
