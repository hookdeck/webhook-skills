# Setting Up Argil Webhooks

## Prerequisites

- An Argil account with an [API key](https://docs.argil.ai)
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI below)

## How Do I Create an Argil Webhook?

Argil webhooks are managed through the API: list, create (with a callback URL and an `events` list), update and delete. One webhook can subscribe to several events. See [Create webhook](https://docs.argil.ai/api-reference/endpoint/webhooks.create).

Illustrative request (the base URL, auth header and field names here are placeholders, so copy the exact ones from the API reference):

```bash
curl -X POST "$ARGIL_API_BASE/webhooks" \
  -H "$ARGIL_AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"callbackUrl": "https://your-app.com/webhooks/argil",
       "events": ["VIDEO_GENERATION_SUCCESS", "VIDEO_GENERATION_FAILED",
                  "AVATAR_TRAINING_SUCCESS", "AVATAR_TRAINING_FAILED"]}'
```

No challenge or validation request is sent to the callback URL.

## Where Do I Get the Argil Webhook Signing Secret?

The response of the create call includes a `secret`, shown **once**. It is `whsec_` + base64, for example `whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD`. Store the full value, including `whsec_`, as `ARGIL_WEBHOOK_SECRET`.

## What If My Webhook Is Not Signed?

Webhooks created since signing shipped are signed with the secret returned once at creation. Webhooks created before then are delivered without a signature, so there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers and verification can't succeed.

Hookdeck's configuration alert for this source reads:

> "Webhooks created before Argil added signing are unsigned. Recreate the webhook to get a whsec_ secret."

To fix it, delete the old webhook, create a new one with the same URL and events, and save the new `secret`. Don't accept unsigned deliveries in your handler to work around it.

## Local Development

```bash
npx hookdeck-cli listen 3000 argil --path /webhooks/argil   # Express / Next.js
npx hookdeck-cli listen 8000 argil --path /webhooks/argil   # FastAPI
```

No account required. Create a webhook pointing at the printed URL, then generate a video or train an avatar to trigger an event.
