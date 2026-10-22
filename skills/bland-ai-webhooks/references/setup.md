# Setting Up Bland AI Webhooks

## Prerequisites

- A Bland account with Dev Portal access
- A public HTTPS endpoint for your handler (Bland validates that a per-call `webhook` is a valid `https://` URL). For local development, use `npx hookdeck-cli listen 3000 bland-ai --path /webhooks/bland-ai`

## Get Your Signing Secret

1. Open the [Account Settings in the Dev Portal](https://app.bland.ai/dashboard?page=settings).
2. Open the **Keys** tab.
3. Click **Replace Secret**.
4. Copy the secret immediately. **Bland shows it only once.**
5. Store it as `BLAND_WEBHOOK_SECRET`.

One secret covers all of your account's webhooks; there is no per-endpoint secret. The secret is the HMAC key as-is: don't base64-decode it or strip a prefix.

## Register Your Endpoint

### Inbound calls

1. Dev Portal → [Inbound Phone Numbers](https://app.bland.ai/home?page=inbound-number).
2. Expand the **Advanced** section for your number.
3. Paste your URL into the **webhook** field and click **Test Webhook**.

### Outbound calls

Pass `webhook` when sending the call (recommended):

```json
{
  "phone_number": "+1234567890",
  "task": "Your call task here",
  "webhook": "https://example.com/webhooks/bland-ai",
  "webhook_events": ["citations"]
}
```

Or expand **Advanced** on the dashboard's Send Call page and set the webhook field.

### SMS

Set the webhook on the SMS number (Messaging dashboard or the Update SMS Webhook endpoint), or pass `webhook` per request in Send SMS / per batch in Send SMS Batch.

## Testing

- The **Test Webhook** button on an inbound number sends a test payload.
- Place a real call and let it end to receive the full post-call payload.
- If you test with webhook.site first, remember it won't verify signatures; switch to your handler before relying on it.

## Gotchas

- The docs say to create a signing secret before verifying; keep your handler failing closed when `BLAND_WEBHOOK_SECRET` is unset.
- Replacing the secret in the dashboard changes the key Bland signs with; update `BLAND_WEBHOOK_SECRET` immediately.
- Enterprise JWT signing (RS256 with a JWKS) is configured separately and isn't covered here.
