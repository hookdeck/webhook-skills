# Setting Up Hint Health Webhooks

## Prerequisites

- A Hint Health partner account (partner API key), or a practice with API Access
- A publicly accessible endpoint. For local work use `npx hookdeck-cli listen 3000 hint-health --path /webhooks/hint-health`

## Get Your Signing Secret

Hint signs every delivery with your **webhooks signature key**. It is one of your partner API keys, by default the one created with your partner account. Store it as `HINT_HEALTH_WEBHOOK_SECRET`.

- Partners: Partner Portal > Webhooks > Settings > Webhooks Signature Key
- A practice with API Access: Admin > Developers > Webhook Endpoints > Webhooks Signature Key

Live and sandbox have separate keys. Rotation takes effect immediately with no overlap, so update your receiver at the same time.

## Register Your Endpoint

Partners register a global or per-integration webhook endpoint with a partner API key. Practices with API Access register their own under Admin > Developers > Webhook Endpoints. Subscribe to the events you need, for example `patient.created`, `patient.updated`, `membership.created`, `membership.updated`, `practitioner.created`. Return a `2xx` within 20 seconds and do the real work in a background task.

## Using Hookdeck

Create a Hint Health source in Hookdeck. Paste the partner API key you chose as the webhooks signature key. Point the webhook URL in Hint at the Hookdeck source URL. Hookdeck's source verifies the `x-hint-signature` header and forwards the request to your destination.

## Test Mode vs Live Mode

Live and sandbox use separate webhooks signature keys. Use the key for the environment that sends the webhook.

## Delivery and Retries

Delivery is at least once with no ordering guarantee. Hint retries failures hourly, up to 72 attempts, and mutes an integration after more than 100 failed attempts (at most one delivery per hour, other events dropped). Make handlers idempotent using the envelope `id`.
