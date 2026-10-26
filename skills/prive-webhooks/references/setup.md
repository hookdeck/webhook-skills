# Setting Up Prive Webhooks

## Prerequisites

- A Prive (Recurly Commerce) merchant account on Shopify
- Your application's public HTTPS webhook endpoint URL

## Get Your Secret Token

Prive (now Recurly Commerce) provides the secret token. Ask Prive support for it if you don't have it. Prive uses it to compute the HMAC sent in `x-prive-hmac-sha256`. Store it as `PRIVE_WEBHOOK_SECRET`.

## Register Your Endpoint

Webhooks are created through the Prive public API (create-webhook endpoint, see [the reference](https://developers.tryprive.com/reference/publicapicontroller_createwebhook)). Each webhook subscribes to **one topic**:

- `subscriptions/created`, `subscriptions/line_removed`, `subscriptions/status/updated`
- `orders/created`
- `billingAttempts/created`, `billingAttempts/success`, `billingAttempts/failed`
- `paymentMethod/updated`
- `subscriptionActivities/created`, `subscription/customAttributes/updated`

Because nothing in the request names the topic, register a **separate endpoint path per topic**, e.g. `/webhooks/prive/subscriptions-created` and `/webhooks/prive/billing-attempts-failed`. Recommended starting set: `subscriptions/created`, `subscriptions/status/updated`, `billingAttempts/failed`, `billingAttempts/success`.

## Using Hookdeck

1. Create a source for Prive in Hookdeck and enter the secret token as the signing secret. Prive (now Recurly Commerce) provides it; ask Prive support if you don't have it.
2. Create one connection per topic (or one source per topic) so each destination path maps to a single topic.
3. Register the Hookdeck source URL as the webhook URL in Prive.

For local development: `npx hookdeck-cli listen 3000 prive --path /webhooks/prive`.

## Testing

Trigger the action in a test store (for example, create a subscription) or send a request you sign yourself with the secret token, as the example tests do.
