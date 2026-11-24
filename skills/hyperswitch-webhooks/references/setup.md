# Setting Up Hyperswitch Webhooks

## Prerequisites

- A Hyperswitch account with access to the business profile you'll use
- A public HTTPS endpoint that accepts `POST` (for local work, see below)

## What Does Hookdeck Tell You About This Source?

Set payment_response_hash_key on the Hyperswitch business profile and paste it here. Without it, deliveries are unsigned and fail verification. Live-mode webhook URLs must be allowlisted by Hyperswitch.

## How Do I Get the Signing Secret?

Signing uses the business profile's **`payment_response_hash_key`**, one key per
profile.

1. Select the business profile in the Hyperswitch Control Center.
2. Set `payment_response_hash_key` on the profile and store it securely.
3. Put the same value in `HYPERSWITCH_WEBHOOK_SECRET`. The code uses it as
   UTF-8 bytes, exactly as written.

You can pass `payment_response_hash_key` when you create or update the business
profile through the API (at least 32 characters). If you don't, the
[API reference](https://api-reference.hyperswitch.io/v1/business-profile/business-profile--update)
says Hyperswitch generates a value, but profile responses show only its first
4 characters, so set your own to have a key to verify with. A profile with no
key sends deliveries without `X-Webhook-Signature-512`.

If you change the key, update every verifier at once. Hyperswitch's
[retry code](https://github.com/juspay/hyperswitch/blob/430d18b9b24364b9ddb3cdca6f40970d0f54e1bc/crates/router/src/workflows/outgoing_webhook_retry.rs)
resends each retry exactly as first signed, so a retry of an earlier event
still carries the old key's signature.

## How Do I Register the Endpoint?

1. Create a public HTTPS endpoint that accepts `POST`. Return a `2xx` only after
   your application has accepted the event for processing.
2. In the Control Center, select the **business profile and mode** the endpoint
   belongs to.
3. Go to **Developers → Payment Settings → Payment Behaviour**.
4. Add the endpoint URL.
5. **In live mode, ask the Hyperswitch team to allowlist the URL.**
6. Save the setting.
7. Send a test payment and confirm your endpoint responds.

Endpoints are per business profile and mode, so test and live need separate
configuration (and separate secrets if the profiles differ).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 hyperswitch --path /webhooks/hyperswitch
```

Use the printed URL as the endpoint. In live mode the URL still has to be
allowlisted by Hyperswitch.

## Connector Callbacks (Not Covered)

The same guide describes registering Hyperswitch's own callback URL on a
connector dashboard (`POST /account/{account_id}/webhooks/{merchant_connector_id}`).
That's the incoming direction and isn't part of this skill.
