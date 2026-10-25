# Setting Up Anarlog Webhooks

## Prerequisites

- The Anarlog desktop app, kept open (deliveries only run while it is running)
- Your application's `https://` webhook endpoint URL (use the Hookdeck CLI for local development)

## Register Your Endpoint and Get the Signing Secret

1. Open **Settings → Developers → Webhooks** in the Anarlog desktop app.
2. Enter an `https://` URL and click **Add webhook**.
3. Copy the signing secret (`whsec_...`). **It is shown once** and Anarlog does not display it again, so store it before leaving the page.
4. Click **Test** to send one `webhook.test` delivery and confirm your endpoint responds.

A new endpoint is subscribed to all events. One installation can configure at most 64 endpoints.

Store the secret in your app as `ANARLOG_WEBHOOK_SECRET`, **including the `whsec_` prefix**. Anarlog uses the whole string as a plain HMAC key (UTF-8). It is not a Standard Webhooks secret, so do not strip or base64-decode the prefix.

## Using Hookdeck

Paste the whole signing secret, including the `whsec_` prefix, into the Hookdeck source's webhook secret. Anarlog uses it as a plain HMAC key.

## Local Development

```bash
npx hookdeck-cli listen 3000 anarlog --path /webhooks/anarlog
```

Use the Hookdeck URL as the endpoint URL in Anarlog.

## Testing and Troubleshooting

- Click **Test** to send a `webhook.test` event (a single attempt, no retries).
- Nothing arriving? Make sure the desktop app is open: events that occur while it is closed are dropped.
- 401 from your handler? Check the secret includes `whsec_` and that you verify the raw body, not re-serialized JSON.
