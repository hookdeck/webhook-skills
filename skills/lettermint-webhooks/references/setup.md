# Setting Up Lettermint Webhooks

## Prerequisites

- A Lettermint account with access to Dashboard → Webhooks
- A public HTTPS endpoint (e.g. `https://your-app.com/webhooks/lettermint`)

## Create the Webhook and Get Your Signing Secret

1. Go to **Dashboard → Webhooks** and click **Create webhook**.
2. Enter a **Name** (e.g. "Production Events") and the **URL** of your endpoint.
3. Optionally add **Basic Auth** credentials if your endpoint requires a login. Basic Auth passes an endpoint login check; keep verifying the signature as well.
4. Choose the **Scope**: all projects (team), one or more projects, or one or more routes.
5. Select the **Events** you want, for example `message.delivered`, `message.hard_bounced`, `message.soft_bounced`, `message.spam_complaint`, `message.failed` and `suppression.added`. Leave **Include machine events** off unless you want security scanner, preview and generic bot tracking observations.
6. Keep **Enabled** on and save.
7. Open the webhook's details page and copy the secret (it starts with `whsec_`). Store it as `LETTERMINT_WEBHOOK_SECRET`.

Paste the whole secret, including the whsec_ prefix. Lettermint uses it as a plain HMAC key.

A webhook has one signing secret, and changing its targets does not change it. You can change the secret at any time; the old one stops working immediately.

You can also create webhooks with `POST /v1/webhooks` on the Team API.

## Test Your Endpoint

Click **Test Webhook** on the webhook's details page. Lettermint sends a properly signed `webhook.test` event to your endpoint.

## Local Development

```bash
npx hookdeck-cli listen 3000 lettermint --path /webhooks/lettermint
```

Use the tunnel URL as the webhook URL (it is HTTPS). For FastAPI use port `8000`.

## Delivery Behavior

The request times out after 30 seconds. Timeouts, `408`, `429` and `5xx` are retried (12 attempts over about 14 hours); other `4xx` responses, including `401`, are not. Respond with any `2xx` quickly and do heavy work asynchronously.
