# Setting Up Oh Dear Webhooks

## Prerequisites

- An Oh Dear account with access to the team's notification settings
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI during development)

## Get Your Signing Secret

1. In Oh Dear, open your team's **notification settings** page.
2. Find the line **Web hook signing secret**. Oh Dear generates one secret per team.
3. Store it as `OH_DEAR_WEBHOOK_SECRET`. Use it as-is, as UTF-8 text; do not hex- or base64-decode it.

Validating requests is optional on Oh Dear's side, but you should always do it.

## Register Your Endpoint

1. On the same notification settings page, scroll to the **webhooks** section.
2. Add your webhook URL (for example `https://example.com/webhooks/oh-dear`).
3. Oh Dear calls it with a `POST` for every notification event; there is no per-event subscription list in the webhook itself.
4. Make sure the URL answers with `200` directly. Redirects count as failures, so use the final URL (watch for `http` to `https` or trailing-slash redirects).

## Local Development

```bash
npx hookdeck-cli listen 3000 oh-dear --path /webhooks/oh-dear
```

Use port `8000` for the FastAPI example. Paste the URL the CLI prints into Oh Dear.

## Testing and Debugging

- In the notification settings, open the menu next to the webhook and pick **Show webhook log** to see the full request, payload and your response. Logs are kept for 5 days and can be filtered by event type, status and response code.
- Use **Resend** to deliver the same payload again after fixing a bug. A resend keeps the original `uuid`.
- A URL with no successful delivery for 48 hours is paused and the team is emailed; re-enable it in the notification settings.
