# Setting Up Marqeta Webhooks

## Prerequisites

- Marqeta API access (the public sandbox works)
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Create the Webhook

`POST /webhooks` with your application token and admin access token:

```json
{
  "name": "my_webhook",
  "active": true,
  "events": ["*"],
  "config": {
    "url": "https://example.com/webhooks/marqeta",
    "basic_auth_username": "my_username",
    "basic_auth_password": "My_20-to-50-character_password",
    "secret": "My_20-to-50-character_secret",
    "signature_algorithm": "HMAC_SHA_256"
  }
}
```

- `basic_auth_username` (1–50 characters) and `basic_auth_password` (20–50, with a digit, lowercase, uppercase and a symbol) are required.
- `secret` and `signature_algorithm` are optional, but `signature_algorithm` is required when you set a secret.
- The API masks `secret`, `basic_auth_username` and `basic_auth_password` in every response. Store them before you send the request.
- Webhook URLs are cached: a change can take up to an hour to apply.

Set `MARQETA_WEBHOOK_USERNAME`, `MARQETA_WEBHOOK_PASSWORD` and, if you set a secret, `MARQETA_WEBHOOK_SECRET` (plus `MARQETA_SIGNATURE_ALGORITHM=sha1` for a legacy `HMAC_SHA_1` webhook).

## 2. Ping It

`POST /webhooks/{token}/ping` sends `{"pings":[{"token":"marqeta","payload":"healthcheck"}]}` to the webhook URL. Your endpoint should answer `200`. A failed ping isn't retried.

In the sandbox, the Simulations 2.0 API (card transactions, direct deposits) can attach a webhook to a simulated event.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 marqeta --path /webhooks/marqeta
```

Use the printed URL as `config.url`.

## Switching Signature Algorithms

To move a webhook from `HMAC_SHA_1` to `HMAC_SHA_256`, set `MARQETA_SIGNATURE_ALGORITHM=sha256,sha1` first, update the webhook, and wait two weeks (the retry window) before going back to `sha256`.

## Using Hookdeck

Create a source with the **Marqeta** source type and enter the webhook's Basic auth username and password. Hookdeck checks them on every request. It doesn't check `X-Marqeta-Signature`, so verify it in your handler if you use a secret. Verification is optional on the source, and Hookdeck applies no timestamp window.
