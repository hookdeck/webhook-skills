# Setting Up FastSpring Webhooks

## Prerequisites

- A FastSpring account with access to the App Dashboard
- Your application's webhook endpoint URL (FastSpring recommends **HTTPS**; it posts to port 443, or to 3443, 8282, 9191, 9000 or 9999)

## Register Your Endpoint

1. Log in to the [FastSpring App Dashboard](https://app.fastspring.com/).
2. Go to **Developer Tools → Webhooks**.
3. Click **Add Webhook** (or edit an existing one) under **Configuration**.
4. Enter your endpoint **URL** (HTTPS recommended).
5. Select the events you want to receive (e.g., `order.completed`,
   `subscription.activated`, `subscription.charge.completed`,
   `subscription.charge.failed`, `subscription.canceled`).
6. Save the webhook.

## Get Your HMAC SHA256 Secret

FastSpring only signs webhooks when an HMAC secret is configured on the webhook:

1. In **Developer Tools → Webhooks → Configuration**, open your webhook.
2. Find the **HMAC SHA256 Secret** field.
3. Enter a strong random secret (or copy the generated one).
4. Save.

Once set, every delivery includes an `X-FS-Signature` header — a base64-encoded
HMAC-SHA256 digest of the raw request body. If the field is left blank, no
signature header is sent and requests are unauthenticated (not recommended).

Store the secret in your environment:

```bash
# .env
FASTSPRING_WEBHOOK_SECRET=your_hmac_sha256_secret
```

## Test vs Live

FastSpring distinguishes test and production events via the `live` boolean on each
event (`false` = test, `true` = live). Use FastSpring's test store / test mode to
trigger sample events, and branch on `event.live` if your handler needs different
behavior for test traffic.

## Local Development

To receive webhooks on localhost, use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 fastspring --path /webhooks/fastspring
```

This provides a public HTTPS URL that forwards events to your local server, plus a
web UI for inspecting and replaying requests. Use the tunnel URL as your webhook
endpoint in the FastSpring dashboard.

## Source IP Allowlisting (Optional)

FastSpring delivers from source IP `107.23.30.83`. You can optionally allowlist it,
but signature verification via `X-FS-Signature` is the primary authenticity check.

## Retries

FastSpring retries any event not marked processed for up to 7 days (at most 12 retries). A `200` marks every event in the POST processed; a `202` marks only the event IDs you list in the response body, one per line; any other status is a failure. Return
`200` only after you have successfully accepted (or safely enqueued) the events.
Automatic retries reuse the same event `id`, so dedupe on `id`.

## Full Documentation

- [FastSpring Webhooks Overview](https://developer.fastspring.com/reference/webhooks-overview)
- [Message Security](https://developer.fastspring.com/reference/message-security)
