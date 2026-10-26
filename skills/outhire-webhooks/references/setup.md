# How to Set Up Outhire Webhooks

## Prerequisites

- An Outhire **admin** account. Webhook management is admin-only.
- A publicly reachable HTTPS endpoint that accepts `POST` and returns a `2xx` within 10 seconds. For local work use `npx hookdeck-cli listen 3000 outhire --path /webhooks/outhire` (port 8000 for FastAPI).

## Register Your Endpoint

1. In the Outhire app open **Settings > Webhooks** (or `/settings/webhooks`).
2. Click **Add webhook** and enter your endpoint URL. Each URL can be registered once per company; to change subscriptions, edit the existing webhook.
3. Select event types. At least one is required: `candidate.applied`, `candidate.stage_changed` or both.
4. Optionally add custom headers (up to 10; names up to 100 characters, values up to 2000, no case-insensitive duplicates). Use them for an extra auth token or routing metadata. `content-type`, `webhook-id`, `webhook-timestamp` and `webhook-signature` are reserved.
5. Save.

## Get Your Signing Secret

After you save, Outhire generates a signing secret prefixed with `whsec_`. Copy it, or view it again later from the webhook's settings. Put the **whole** value, `whsec_` prefix included, in `OUTHIRE_WEBHOOK_SECRET`. The libraries strip the prefix and base64-decode the rest to get the HMAC key. Each webhook has its own secret.

## Test the Endpoint

Click **Send test ping**. Outhire sends a signed `webhook.ping` delivery. It shows in the delivery log like any other, and it isn't a challenge, so your endpoint only needs to verify it and return `2xx`.

## Manage Webhooks

Admins can enable or disable a webhook without deleting it, delete it, edit its custom headers, view the signing secret and inspect delivery logs (status code, request and response headers and bodies, delivery status `sending`, `success` or `failed`, timestamp and attempt count).

## Which Events Fire in Testing?

`candidate.applied` fires only for candidates who apply directly through your careers page or application form. Candidates created through the API or other intake methods don't trigger it. `candidate.stage_changed` fires when a stage actually changes, from the UI, from Joel or from the public API (`PATCH /api/v1/candidates/:id`).
