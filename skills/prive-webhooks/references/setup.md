# Setting Up Prive Webhooks

## Prerequisites

- A Prive (Recurly Commerce) merchant account on Shopify
- Your application's public HTTPS webhook endpoint URL

## Get Your Signing Key

Recurly Support (`support@recurly.com`) issues a per-merchant `webhookSigningKey` (the older Prive docs call it the secret token). Merchants can't generate it, and Recurly sends no deliveries until it's configured, although creating a webhook succeeds without it. It's used to compute the HMAC sent in `x-prive-hmac-sha256`. Store it as `PRIVE_WEBHOOK_SECRET`.

There's no rotation procedure: a new key is a hard cutover, and old-key signatures stop validating as soon as it takes effect.

## Register Your Endpoint

Webhooks are created through the Prive public API (create-webhook endpoint, see [the reference](https://developers.tryprive.com/reference/publicapicontroller_createwebhook)). Each webhook subscribes to **one topic**:

- `subscriptions/created`, `subscriptions/line_removed`, `subscriptions/status/updated`
- `orders/created`
- `billingAttempts/created`, `billingAttempts/success`, `billingAttempts/failed`
- `paymentMethod/updated`
- `subscriptionActivities/created`, `subscription/customAttributes/updated`

The body's `topic` field names the topic, so one endpoint can receive every webhook. A **separate endpoint path per topic**, e.g. `/webhooks/prive/billing-attempts-failed`, works as a second check. Recommended starting set: `subscriptions/created`, `subscriptions/status/updated`, `billingAttempts/failed`, `billingAttempts/success`.

## Using Hookdeck

1. Create a source for Prive in Hookdeck and enter the signing key Recurly Support issued.
2. Route on the body's `topic` with connection filters, or give each topic its own path.
3. Register the Hookdeck source URL as the webhook URL in Prive.

For local development: `npx hookdeck-cli listen 3000 prive --path /webhooks/prive`.

## Testing

Send a test with `POST /api/v1/webhooks/{id}/test`, trigger the action in a Shopify testing store as Recurly suggests, or send a request you sign yourself, as the example tests do.
