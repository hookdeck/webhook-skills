# Setting Up HireHive Webhooks

## Prerequisites

- HireHive account with the permission to manage webhooks
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Create a Webhook?

1. In HireHive, open the webhook settings and create a webhook. HireHive's docs show this only in a video ([creating a webhook](https://r2.docs.hirehive.com/creating-a-webhook.mp4)), so menu names may differ from what is written here.
2. Enter the HTTPS URL where events should be sent.
3. Choose the events to listen for: one or several of the 19 documented events (`job.*`, `application.*`, `candidate.*`, `feedback.*`, `interview.*`).
4. Save the webhook.

You can create an unlimited number of webhooks, enable or disable each one at any time, and view a log of the requests sent to it. No challenge or validation request is sent to your URL when you save.

HireHive also has API endpoints for listing, creating and updating webhooks and for listing webhook events, see the [API reference](https://docs.hirehive.com/api-reference/webhooks/list).

## Where Is My Signing Secret?

Each webhook has its own secret in that webhook's settings. HireHive's text never shows the format; the video displays a value starting with `whsec_` (for example `whsec_XgGh8Iqsem+...`). Store the full value, prefix included, in `HIREHIVE_WEBHOOK_SECRET`. The HMAC key is the base64-decoded part after `whsec_`. Keep it out of client-side code and version control.

Because every webhook has its own secret, a handler that serves several webhooks needs the matching secret for each URL.

## How Do I Test a Webhook?

1. Start a tunnel with the Hookdeck CLI (no account required):

   ```bash
   # Express / Next.js (use 8000 for FastAPI)
   npx hookdeck-cli listen 3000 hirehive --path /webhooks/hirehive
   ```

2. Use the printed URL as the webhook URL in HireHive.
3. Perform an action that fires a subscribed event, such as creating a job or moving an application to another stage.
4. Check the webhook's request log in HireHive, which can also resend an event.

## Retries and Replays

Failed deliveries are retried on a fixed schedule for about 75.5 hours. Retries and replays keep their original `webhook-timestamp`, so the `standardwebhooks` library's 5-minute window rejects them when they arrive late. See [verification.md](verification.md) for a manual verifier with a configurable window.

## IP Allowlists

HireHive's docs publish no source IP list. Verify `webhook-signature` instead of allowlisting.
