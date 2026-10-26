# Setting Up Prividium Webhooks

## Prerequisites

- A Prividium deployment and an auth token for its permissions API (see the docs' "Programmatic Token Management"), or admin UI access
- A publicly reachable HTTPS URL for your handler (use the Hookdeck CLI for local development)
- For event webhooks with `decode_events`, the contract added in the admin UI's Contracts section

## How Do I Create a Webhook in the UI?

1. Open **Webhooks** and select **Add Webhook**.
2. Choose **Event** or **Address** as the type.
3. Enter the endpoint `name` and `url`.
4. Event: enter `contract` and `topic0`, optionally enable **Decode Events**. Address: add one or more EVM addresses.
5. Select **Create Webhook**, then **copy the signing key immediately**. It is shown once.

## How Do I Create a Webhook with the API?

Replace the host with your deployment's permissions API:

```bash
curl -X POST http://localhost:8000/api/v1/event-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "name": "My Mint Watcher",
    "url": "https://example.com/webhooks/prividium",
    "contract": "0x66EC845C0B07D1728B1b14921D561fe7963A5Ab8",
    "topic0": "0xcf3dc07771cc79f08443885798a1e22d38a980af01eb51c3fd4b475afa81467b",
    "decode_events": true
  }'
```

The response holds `endpoint.signing_key` (for example `whsec_0f71ea60...`). Address webhooks use `POST /api/v1/address-webhook`. Other routes, for both types: `GET` (list, with `limit` and `offset`), `GET /{id}`, `PATCH /{id}` (`url`, `enabled`, and `decode_events` on event webhooks), `DELETE /{id}` (204). For event webhooks `contract`, `topic0` and the chain can't be changed. Invalid input returns `400`; unknown or unauthorized ids return `404`. No challenge request is documented.

## Where Do I Keep the Signing Key?

Put the full `whsec_...` value in `PRIVIDIUM_WEBHOOK_SECRET`. Reads never return it again, so a lost key means rotating. Keep it out of client-side code and version control.

## How Do I Rotate the Signing Key?

Rotate immediately if a key is exposed. In the admin UI open the webhook, choose **Rotate Signing Key**, set `retire_after_secs` (default `86400`), confirm, and copy the new key from the one-time modal. With the API:

```bash
curl -X POST "http://localhost:8000/api/v1/event-webhook/<ENDPOINT_UUID>/signing-keys/rotate" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"retire_after_secs": 86400, "version": "v1"}'
```

(`/address-webhook/...` for address webhooks; both fields are optional.) The response returns `signing_key`, `key_id` and `version`. During the overlap, `webhook-signature` carries two `v1,` entries. Recommended order: store the new key, deploy a verifier that accepts old and new (the examples accept `PRIVIDIUM_WEBHOOK_SECRET=whsec_old,whsec_new`), wait out `retire_after_secs`, then drop the old key.

## How Do I Test Locally?

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 prividium --path /webhooks/prividium
```

Use the tunnel URL as the webhook `url`. Your deployment's webhook service must be able to reach it over the internet. The docs' own local-development notes use an ngrok HTTPS URL the same way.

## Pausing and Suspension

Use **Pause** / **Activate** on the webhook details page to stop and resume deliveries without losing the subscription. A **Suspended** webhook was disabled by the service (repeated delivery failures, an HTTP `410`, or lost chain permission); fix the cause, then **Activate**.
