# Setting Up Hugging Face Webhooks

## Prerequisites

- A Hugging Face account (free works; PRO/Team/Enterprise needed for higher rate limits)
- Your application's webhook endpoint URL (publicly reachable HTTPS, e.g. `https://api.example.com/webhooks/huggingface`)
- (Recommended) A secret token to authenticate incoming requests

## Generate a Secret

Hugging Face lets you provide your own secret — generate a strong random value:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

> Only ASCII characters are supported in the secret.

Save this value — you'll paste it into the Hugging Face webhook settings and store it as `HUGGINGFACE_WEBHOOK_SECRET` in your app.

## Create the Webhook

1. Open the Webhooks settings page: <https://huggingface.co/settings/webhooks>.
2. Click **Add a new webhook**.
3. Fill in the form:
   - **Target URL**: your endpoint, e.g. `https://api.example.com/webhooks/huggingface`.
   - **Secret**: paste the secret you generated.
   - **Watched items**: add the users/orgs and/or specific repos to watch. A webhook can watch repos you don't own.
   - Choose whether to subscribe to repo updates, Pull Requests, discussions, and/or comments.
4. Save the webhook.

### Pass the secret in the URL (alternative)

If reading HTTP headers in your handler is hard, you can put the secret directly in the URL as a query parameter:

```
https://api.example.com/webhooks/huggingface?secret=your_secret_value
```

Your handler should still verify it with timing-safe comparison.

## Test Your Webhook

1. Go back to **Settings → Webhooks** and open your webhook.
2. The **Activity** tab lists every recent event with the request payload, response status, and response body.
3. Click **Replay** next to any past delivery to send the same payload again — this is the easiest way to debug locally.

> Replays use the webhook's **current** target URL and secret, not the ones at the time of the original delivery.

## Local Development

You need a public HTTPS URL. Two easy options:

**Hookdeck CLI (recommended, no account needed):**

```bash
npx hookdeck-cli listen 3000 huggingface --path /webhooks/huggingface
```

**Or use a quick capture-all service** while you build the verification:

- [Webhook.site](https://webhook.site/)
- [Beeceptor](https://beeceptor.com/)

Both return `200 OK` to any request and let you inspect the payload.

## Rate Limit

Each webhook is limited to **1,000 triggers per 24 hours**. Usage is visible in the **Activity** tab. Contact website@huggingface.co for higher limits.

## Triggering Hugging Face Jobs

A webhook can [trigger a Hugging Face Job](https://huggingface.co/docs/hub/jobs-webhooks) instead of (or in addition to) calling your endpoint, useful for compute-heavy reactions like fine-tuning or evaluation.

## Troubleshooting

- **401 from your endpoint**: `X-Webhook-Secret` doesn't match `HUGGINGFACE_WEBHOOK_SECRET`. Verify both, watch for trailing whitespace.
- **Header missing**: confirm a secret is set in webhook settings. If you can't read headers, switch to the `?secret=` query parameter.
- **No deliveries**: confirm the webhook is enabled and that the watched items actually generate the event you expect.
- **Replays going to old URL**: replays use the current configured URL — update settings if you've moved the endpoint.

## FAQ

- **Org-wide webhooks** (one webhook for the entire org as actor) are not supported.
- **Subscribe to all events on HF or all models** is not user-configurable; email website@huggingface.co.
