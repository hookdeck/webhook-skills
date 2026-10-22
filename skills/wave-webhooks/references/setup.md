# Setting Up Wave Webhooks

## Prerequisites

- A Wave **Pro** business. Anyone can create an app and configure webhooks, but delivery only works for businesses with an active Pro subscription (Starter and Standard don't deliver).
- A public HTTPS endpoint with a valid CA-signed certificate (no self-signed), TLS 1.2 or later, not pointing at a private or internal network. Use the Hookdeck CLI for local development.

## Create an App

1. Log in to Wave and open **Manage Applications**.
2. Click **+ Create New Application** (or pick an existing one).
3. Enter an application name and a Redirect URI (used for OAuth).
4. Save the Client ID and Client Secret.

## Request the Right OAuth Scopes

A webhook subscription being active doesn't mean data flows. Users must authorize your app with the scopes for the events you want; otherwise delivery is skipped for them.

| Events | Minimum scope |
|--------|---------------|
| `invoice.*` | `invoice:read` or `invoice:*` |
| `estimate.*` | `estimate:read` or `estimate:*` |
| `checkout.paid` | `checkout:read` or `checkout:*` |

If you add events that need new scopes, users must re-authorize your app.

## Register Your Endpoint

1. Open the **Webhooks** page and select your app (a new one shows **Needs Configuration**).
2. Paste your **Endpoint URL**.
3. In the **Listening** tab, tick the events to receive, e.g. `invoice.paid`, `invoice.sent`, `estimate.accepted`, `checkout.paid`.

## Get Your Webhook Secret

Wave's Webhooks Setup Guide describes verifying with "your webhook secret" but **doesn't say where in the dashboard the secret is shown**. Look on the app's Webhooks page and in the app's settings (Manage Applications); if you can't find it, ask Wave developer support. Set it as `WAVE_WEBHOOK_SECRET`. Don't assume it is your OAuth Client Secret unless Wave confirms it.

## Testing

On the Webhooks page, **Logs & deliveries** shows each payload and your endpoint's response, with filters by status and business ID (use the raw `business_id` UUID). Expanding an entry offers **Re-trigger event**, which resubmits that payload. You can also pause or resume the webhook there.

```bash
npx hookdeck-cli listen 3000 wave --path /webhooks/wave
```

Use the Hookdeck URL as the Endpoint URL.
