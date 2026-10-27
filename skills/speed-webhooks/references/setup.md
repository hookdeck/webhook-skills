# Setting Up Speed Webhooks

## Prerequisites

- A [Speed](https://app.tryspeed.com/dashboard) account
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## How Do I Add a Speed Webhook Endpoint in the Dashboard?

1. Log in to the Speed web app and go to **Dashboard → Developers → Webhooks**.
2. Click **Add endpoint** and enter your HTTPS URL, for example `https://your-app.com/webhooks/speed`.
3. Choose webhooks for your own account or for connected accounts, add a description and pick an API version (the default is `2022-04-15`).
4. Click **Next**, select the events you need (for example `payment.paid`, `payment.confirmed`, `checkout_session.paid`) and click **Add endpoint**.
5. The endpoint's detail page shows its status, id and **secret** (use the reveal button).

You can enable the same events on several endpoints and add the same URL more than once. Speed documents no challenge or validation request.

## How Do I Create One with the API?

`POST /webhooks` with `url`, `api_version`, `enabled_events` and `connect`:

```json
{
  "url": "https://your-app.com/webhooks/speed",
  "description": "orders",
  "api_version": "2022-10-15",
  "enabled_events": ["payment.paid", "payment.confirmed"],
  "connect": false
}
```

Set `connect` to `true` to receive events of connected accounts instead of your own. Related calls: Retrieve (`GET /webhooks`), List, Deactivate (`POST /webhooks/{id}/disable`) and Activate (`POST /webhooks/{id}/enable`).

## Where Is the Signing Secret?

Each endpoint has its own secret. Reveal it on the endpoint page, or read `secret` from Get Webhook Endpoint By Id. It looks like `wsec_<base64>`, **not** `whsec_`.

- In your own code, put the full value in `SPEED_WEBHOOK_SECRET`. The examples swap `wsec_` for `whsec_` before handing it to the `standardwebhooks` library, which only strips `whsec_`. Base64-decoding the part after the prefix gives the HMAC key.
- In a Hookdeck Speed source, paste it with the prefix changed. Hookdeck's configuration alert reads: "Speed shows the secret with a wsec_ prefix. Replace wsec_ with whsec_ when you paste it here, or verification fails."

## What Does Speed Expect Back?

- A `2xx` as quickly as possible; process asynchronously. Any other outcome is retried (immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h) and an endpoint that keeps failing for 5 days is deactivated, after an email warning. See [overview.md](overview.md).

## Connect Endpoints

Platform endpoints receive connected accounts' events with `data.account_id` set. If two platform accounts are linked to the same connected account and both subscribe, both receive its events. The connected account's own endpoint receives them without `account_id`.

## How Do I Test Locally?

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 speed --path /webhooks/speed
```

Register the printed Hookdeck URL as the endpoint URL, then trigger an event (for example create a payment in test mode) or retry a message from the dashboard.

## Which Secret Do I Use?

Use the secret of the endpoint that receives the deliveries; a different endpoint's secret fails verification.
