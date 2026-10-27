# Setting Up Argil Webhooks

## Prerequisites

- An Argil account and an [API key](https://docs.argil.ai/resources/introduction), sent in the `x-api-key` header
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

Argil webhooks are managed through the API: list, create, update and delete. The docs don't describe a dashboard screen for them.

## How Do I Create an Argil Webhook and Get the Signing Secret?

```bash
curl -X POST https://api.argil.ai/v1/webhooks \
  -H "x-api-key: $ARGIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"callbackUrl": "https://your-app.com/webhooks/argil",
       "events": ["VIDEO_GENERATION_SUCCESS", "VIDEO_GENERATION_FAILED",
                  "AVATAR_TRAINING_SUCCESS", "AVATAR_TRAINING_FAILED"]}'
```

`callbackUrl` and `events` (at least one) are required. The `201` response is the webhook (`id`, `callbackUrl`, `events`, `createdAt`, `updatedAt`) plus `secret`, for example `whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD`.

**The secret is returned only by this call.** Store the full value, including `whsec_`, as `ARGIL_WEBHOOK_SECRET`. The docs describe no endpoint to read or rotate it, so if you lose it, delete the webhook and create a new one.

## Why Do My Argil Deliveries Have No Signature?

Webhooks created before Argil added signing are delivered unsigned. Recreate the webhook to get a `whsec_` secret. Hookdeck's alert for this source says: "Webhooks created before Argil added signing are unsigned. Recreate the webhook to get a whsec_ secret."

## Manage Existing Webhooks

| Action | Call |
|--------|------|
| List | `GET https://api.argil.ai/v1/webhooks` ([reference](https://docs.argil.ai/api-reference/endpoint/webhooks.list)) |
| Create | `POST https://api.argil.ai/v1/webhooks` ([reference](https://docs.argil.ai/api-reference/endpoint/webhooks.create)) |
| Update (URL or events, re-enables a disabled webhook) | [reference](https://docs.argil.ai/api-reference/endpoint/webhooks.update) |
| Delete | [reference](https://docs.argil.ai/api-reference/endpoint/webhooks.delete) |

## Local Development

```bash
npx hookdeck-cli listen 3000 argil --path /webhooks/argil
```

Use the printed URL as `callbackUrl` in the create call above, then render a video or train an avatar to receive events. Use `8000` for the FastAPI example.

## Validation

Argil's docs describe no challenge or handshake request, so a new endpoint just needs to answer `2xx` within 10 seconds.
