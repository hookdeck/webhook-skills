# Setting Up Morta Webhooks

## Prerequisites

- A Morta hub where you can manage settings
- A public HTTPS endpoint that accepts `POST` (e.g. `https://your-app.com/webhooks/morta`)

## Get Your Signing Secret

1. Open your hub in Morta.
2. Go to **Hub > Settings > Secrets**.
3. Copy the signing secret and store it as `MORTA_WEBHOOK_SECRET`. Use it as-is, as UTF-8 text
   (don't hex- or base64-decode it).

## Register Your Endpoint

1. Go to **Hub > Settings > Webhooks** and create a notification.
2. Enter your endpoint URL.
3. Pick one or more events (for example `table.row_created`, `hub.created`, `member.created`,
   `document.response_submitted`), and optionally limit it to a specific table or document. Use the
   `hub.*` and `document.*` names: the older `project.*` and `process.*` names are deprecated.
4. Save. Morta now `POST`s matching events to the endpoint, signed with `Morta-Signature`.

Avoid subscribing to high-volume events such as `hub.read` unless you need them.

To move an existing webhook from the old names, first make your handler accept the new `event`
strings, then untick each hub or document event in **Hub > Settings > Webhooks**, tick it again
and save.

## Respond Quickly

Return any `2xx` within 10 seconds. Any other status, or a slower answer, marks the delivery
failed. Do slow work after acknowledging. Morta's docs don't describe retries.

## Local Development

```bash
npx hookdeck-cli listen 3000 morta --path /webhooks/morta
```

Use the tunnel URL as the endpoint URL. For FastAPI use port `8000`.
