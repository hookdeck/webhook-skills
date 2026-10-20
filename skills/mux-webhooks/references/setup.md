# Setting Up Mux Webhooks

## Prerequisites

- A Mux account and the environment you want events from (webhooks are scoped per environment)
- A publicly reachable HTTPS URL for your webhook endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint in the Dashboard

1. Open the [Mux Dashboard](https://dashboard.mux.com) and switch to the environment you want to receive events from.
2. Go to **Settings → Webhooks** ([dashboard.mux.com/settings/webhooks](https://dashboard.mux.com/settings/webhooks)).
3. Create a new webhook and enter your URL, e.g. `https://example.com/webhooks/mux`.
4. Save. Mux sends **all** events for that environment to the URL; there is no per-event subscription, so filter on `type` in your handler.

## Get Your Signing Secret

1. On the same **Settings → Webhooks** page, find the webhook you created.
2. Reveal and copy its **signing secret**.
3. Store it as `MUX_WEBHOOK_SECRET` in your app's environment.

The signing secret is **different for each webhook endpoint**. If you register more than one URL (or one per environment), each needs its own secret.

## Register an Endpoint via the API

You can also create webhooks with the [Webhooks API](https://www.mux.com/docs/api-reference/system/webhooks) (see [Manage webhooks with the API](https://www.mux.com/docs/core/manage-webhooks)). The create response includes `signing_secret`. **The API returns it only once** — save it immediately; it cannot be retrieved again.

## Local Development

Mux can't reach `localhost`, so tunnel to it with the Hookdeck CLI (no account required):

```bash
# Express or Next.js (port 3000)
npx hookdeck-cli listen 3000 mux --path /webhooks/mux

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 mux --path /webhooks/mux
```

Register the public URL the CLI prints as the webhook URL in the Mux Dashboard, then create an asset or upload to trigger events.

Mux's own CLI can also forward events and send synthetic ones:

```bash
mux webhooks listen --forward-to http://localhost:3000/webhooks/mux
mux webhooks trigger video.asset.ready --forward-to http://localhost:3000/webhooks/mux
```

When forwarding, the Mux CLI prints its own signing secret (unique per environment, persisted between sessions) and signs requests with `mux-signature`. Use **that** secret as `MUX_WEBHOOK_SECRET` while testing with the Mux CLI.

## Test vs Production Environments

Mux has no separate "test mode" flag for webhooks; instead, each Mux **environment** (e.g. Development, Production) has its own webhook configuration and signing secrets. Configure a webhook in each environment you use, and keep their secrets separate.
