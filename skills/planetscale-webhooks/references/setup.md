# Setting Up PlanetScale Webhooks

## Prerequisites

- A PlanetScale database, and you must be a **database administrator** to create webhooks for it
- A publicly reachable `https://` URL for your endpoint (use `npx hookdeck-cli listen 3000 planetscale --path /webhooks/planetscale` for local development)

## Register Your Endpoint

1. In the PlanetScale dashboard, select your database.
2. Click **Settings**, then **Webhooks** in the sub-menu.
3. Click **Add webhook**.
4. Enter a unique URL. It must use HTTPS, be reachable from the internet (no localhost), and handle incoming `POST` callbacks.
5. Optional: add an `Authorization` header if your receiver needs one. Enter the complete value including the scheme (for example `Bearer <token>`); PlanetScale sends it unchanged. It is write-only afterwards. This authenticates PlanetScale to you and does not replace the signature.
6. Select the events to receive. Good starting points: `branch.ready`, `deploy_request.opened`, `deploy_request.queued`, `deploy_request.in_progress`, `backup.failed`, `branch.anomaly`.
7. Click **Save webhook**.

You can also manage webhooks with `pscale webhook` (the CLI) or the webhooks API endpoints.

## Get Your Signing Secret

Each webhook has its own secret.

1. Settings → Webhooks.
2. Click the **…** (ellipsis) next to the webhook and click **Show secret**.
3. Store it as `PLANETSCALE_WEBHOOK_SECRET` in your server's secret store. Use it exactly as shown: its UTF-8 bytes are the HMAC key.

## Test Your Endpoint

Click **…** → **Test webhook**. You get a `POST` with `event` set to `webhook.test`. Only one test can be sent every 20 seconds. The "Webhooks" page shows the status of the last delivery under each webhook.

## Limits and Delivery

- Up to 5 webhooks per database (contact PlanetScale for more).
- Your endpoint must answer `2xx` within 2 seconds. Redirects are not followed.
- Webhooks that repeatedly fail are disabled: check the Webhooks page if events stop arriving.
- Deliveries originate from `3.209.149.66`, `3.215.97.46` and `34.193.111.15` if you want to allowlist them in addition to verifying signatures.

## Using Hookdeck

Create a Hookdeck source of type PlanetScale, paste the webhook secret into it, and use the Hookdeck source URL as the webhook URL in PlanetScale. Hookdeck's source verifies `X-PlanetScale-Signature` (hex HMAC-SHA256 of the raw body), then forwards to your app with retries and replay.
