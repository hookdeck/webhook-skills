# Setting Up Felloh Webhooks

## Prerequisites

- A Felloh account with access to Developer Configuration in the dashboard
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 felloh --path /webhooks/felloh` for local development)

## Register Your Endpoint

1. In the Felloh dashboard, open **Developer Configuration** and create a webhook.
2. Enter the **URL** of your endpoint (for example `https://example.com/webhooks/felloh`).
3. Select the events to listen for: transaction status, refund status, booking and user events are available.
4. Optionally add child organisations whose events should also be sent.
5. Save. The **signing key** is displayed once.

## Get Your Signing Key

Copy the signing key when it is shown and store it as an environment variable. It can't be viewed again, so create a new webhook if you lose it:

```bash
FELLOH_WEBHOOK_SECRET=your_signing_key
```

Use the key exactly as shown. It is used as UTF-8 bytes, not decoded.

## What Felloh Sends

- `POST` with a JSON body
- `X-Signature`: hex HMAC-SHA256 of the raw body
- No event-name field: the handler tells deliveries apart by payload shape (see [overview.md](overview.md))

Respond with `2xx` within 30 seconds. Any other status is a failure.

## Testing

Send a test delivery from the dashboard. It carries `X-Felloh-Test: true`, is signed with your real key and is never retried. Use the Hookdeck CLI tunnel above to see it arrive locally. Delivery logs are kept for 30 days.
