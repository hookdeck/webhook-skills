# Setting Up Render Webhooks

## Prerequisites

- A Render workspace on the **Pro plan or higher**. Pro workspaces can send to one destination URL; Scale and Enterprise workspaces can send different event sets to up to 100 URLs.
- **Workspace admin** role. Only admins can create and modify webhooks.
- A public HTTPS endpoint that returns `2xx` within 15 seconds. For local development, tunnel one with the Hookdeck CLI (below).

## How Do I Create a Render Webhook?

1. In the [Render Dashboard](https://dashboard.render.com), open your workspace home.
2. Click **Integrations > Webhooks** in the left sidebar.
3. Click **+ Create Webhook**.
4. Enter a **Name**, the endpoint **URL** (for example `https://your-app.com/webhooks/render`), and select the **Events** to send. Any combination of types is allowed. A good starting set is Deploy Ended, Build Ended and Server Failed.
5. Click **Create Webhook**.

You can change the event selection later from the webhook's settings.

## Where Is the Signing Secret?

Open the webhook and go to its **Settings** page. The signing secret is shown there. Copy it into `RENDER_WEBHOOK_SECRET` exactly as shown and pass it to the Standard Webhooks library unchanged. The library strips an optional `whsec_` prefix and base64-decodes the rest to get the HMAC key.

Keep it out of version control. Store it in your secret manager or, on Render, as an environment variable or secret file on the receiving service.

## How Do I Rotate a Compromised Secret?

Render has no in-place rotation. Its documented procedure is:

1. Create a **new** webhook with the same URL and events.
2. Update your endpoint to verify with the new webhook's signing secret.
3. Delete the compromised webhook.

Between steps 1 and 3, both webhooks deliver every event, and deliveries from the one whose secret your endpoint isn't using fail verification and get retried. Do steps 2 and 3 close together. Because `data.id` is the service event ID, deduping on it stops an event that arrives from both webhooks from being processed twice.

## How Do I Test Locally?

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 render --path /webhooks/render
# FastAPI
npx hookdeck-cli listen 8000 render --path /webhooks/render
```

No account is required. Use the printed URL as the webhook URL, then trigger events:

- A **Manual Deploy** of a Git-backed service sends `build_started`, `build_ended`, `deploy_started` and `deploy_ended` (if those events are selected).
- Triggering a cron job run sends `cron_job_run_started` and `cron_job_run_ended`.

Render's docs don't describe a "send test event" action, so trigger a real event.

## What Happens When My Endpoint Fails?

- Non-`2xx` or no response within 15 seconds counts as a failure.
- Render retries with exponential backoff, up to 8 attempts per notification; the last is ~33 hours after the first.
- After the third failure Render emails you.
- If all attempts fail, Render **disables the webhook** and emails you again. Fix the issue, then re-enable it from the webhook's **Settings** page.

## Production Reliability

For guaranteed delivery, replay and rate limiting in front of your handler, put the [Hookdeck Event Gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) between Render and your endpoint.
