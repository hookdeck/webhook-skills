# Setting Up Klarna Webhooks

## Prerequisites

- Klarna Notifications API credentials (a Klarna partner or test account)
- A public HTTPS endpoint on port 443 or 8443 (use the Hookdeck CLI locally)

## 1. Create a Signing Key

Call [createSigningKey](https://docs.klarna.com/klarna-network-distribution/api/klarna-notifications-api/) (`POST /v2/notification/signing-keys`). Store the returned `signing_key` and its ID immediately: Klarna won't show the key again.

## 2. Create a Webhook

Create a webhook through the Notifications API with your URL, the event types (wildcards such as `payment.request.*` work) and the signing key to use. Update, delete or read it later with updateWebhook, deleteWebhook and getWebhookById.

## 3. Configure the Key

Set `KLARNA_SIGNING_KEY` to the `signing_key`, as-is.

## Test

In the test environment, simulate a webhook by giving the `webhook_id`, `event_type` and `event_version`. Klarna sends a test event with dummy data that follows the event's schema (`metadata.live` is `false`).

## Rotate Keys

1. Create a new signing key.
2. Make your receiver accept both keys (pick by `Klarna-Signing-Key-Id`).
3. Update the webhook to use the new key.
4. Check that deliveries verify with it.
5. Delete the old key with deleteSigningKey.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 klarna --path /webhooks/klarna
```

Use the printed URL (port 443) as the webhook URL.

## Using Hookdeck

Create a source with the **Klarna** source type and paste the `signing_key` as-is. Hookdeck verifies `Klarna-Signature`. Verification is optional on the source, and Hookdeck applies no timestamp window. A source holds one key, so update it as part of a rotation.
