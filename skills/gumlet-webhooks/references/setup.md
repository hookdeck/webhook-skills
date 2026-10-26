# Setting Up Gumlet Webhooks

## Prerequisites

- A Gumlet account with a video source
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 gumlet --path /webhooks/gumlet` locally)

## Choose a Secret Token

> Set a Secret Token on the Gumlet webhook. Webhooks without one send nothing to verify.

The Secret Token is optional in Gumlet, but without it requests carry no credential and there is
nothing to check. Generate a long random value (for example `openssl rand -hex 32`), set it as the
webhook's **Secret Token**, and store the same value as `GUMLET_WEBHOOK_SECRET`. Gumlet returns it as
plain text in the `x-gumlet-token` header on every request.

## Register Your Endpoint

1. In the Gumlet dashboard, open the webhook settings (the docs link "Configure Webhook via
   dashboard").
2. Enter your endpoint URL, including the protocol (e.g. `https://example.com/webhooks/gumlet`).
3. Choose the trigger events (video, live video and analytics events are listed in
   [overview.md](overview.md)) and the video source or sources it applies to.
4. Enter the **Secret Token**.
5. Save. Gumlet sends a `POST` for each event on the selected sources.

Webhooks can also be created through the Gumlet API; see Gumlet's API reference.

## Test

Upload a small video to the source and check that your endpoint logs `video.status.ready`. Or replay
with curl:

```bash
curl -X POST http://localhost:3000/webhooks/gumlet \
  -H "Content-Type: application/json" \
  -H "x-gumlet-token: $GUMLET_WEBHOOK_SECRET" \
  -d '{"type":"video.status.ready","status":"ready","asset_id":"65b168a6e99b77f116c0e488"}'
```

## Network Notes

The credential is static and sent in the clear inside the TLS tunnel only, so use an `https://` URL.
If the Secret Token leaks, change it in Gumlet and update `GUMLET_WEBHOOK_SECRET` together.
