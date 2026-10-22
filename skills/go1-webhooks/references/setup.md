# Setting Up Go1 Webhooks

## Prerequisites

- A Go1 developer account with an application that can register webhooks
- A public HTTPS endpoint (e.g. `https://your-app.com/webhooks/go1`)

## Set Your Signing Secret

Go1 signs requests only when the webhook has a `secret_key`.

1. Choose a secret of at most 64 characters (any string; it is used as UTF-8 text, not decoded).
2. Set it as `secret_key` when you create or update the webhook, following the [Go1 webhooks guide](https://developers.go1.com/docs/developer-tools/webhooks/overview-webhooks/).
3. Store the same value as `GO1_WEBHOOK_SECRET` in your application.

If no `secret_key` is set, requests have no `Go1-Signature` header and cannot be verified.

## Register Your Endpoint

1. Create the webhook with your endpoint URL, the `secret_key`, and the events you want. Recommended: `enrollment.create`, `enrollment.update`, `enrollment.delete`.
2. Confirm the first delivery arrives with a `Go1-Signature` header.

## Local Development

```bash
npx hookdeck-cli listen 3000 go1 --path /webhooks/go1
```

Use the tunnel URL as the webhook URL. For FastAPI use port `8000`.

## Rotating the Secret

Update `secret_key` on the webhook and `GO1_WEBHOOK_SECRET` in your app together; requests signed with the old secret fail verification once you switch.
