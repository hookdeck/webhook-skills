# Setting Up Qonto Webhooks

## Prerequisites

- A Qonto account with access to the Business API (credentials as described in Qonto's API docs)
- A publicly reachable HTTPS endpoint that accepts `POST` (use the Hookdeck CLI while developing)

## How Do I Get the Signing Secret?

Each subscription has its own secret, 32-128 characters. You can supply it in the create request (`secret`), or leave it out and Qonto generates one. It is returned **only once**, in the create response, so store it right away as `QONTO_WEBHOOK_SECRET`.

Paste the whole secret, including the whsec_ prefix. Qonto uses it as a plain HMAC key.

The schema example (`whsec_VuvcYxzMbryt1UBytq58jtGBxCgbQdzX/c0vj5ZLjUA=`) looks like a Standard Webhooks secret, but it is not one. Nothing is stripped or base64-decoded.

## How Do I Register My Endpoint?

Call `POST /v2/webhook_subscriptions` with:

- `callback_url`: your public webhook URL (for example `https://example.com/webhooks/qonto`)
- `types`: one or more subscription types, such as `v1/transactions`, `v1/cards`, `v1/transfers`
- `secret` (optional): your own secret

Register only for the types you need to avoid unnecessary load. Events that occurred before the subscription are not sent.

For the request/response schema, see [Create a webhook subscription](https://docs.qonto.com/api-reference/business-api/webhooks/create-a-webhook-subscription).

## Local Development

```bash
npx hookdeck-cli listen 3000 qonto --path /webhooks/qonto
```

Use the URL the CLI prints as your `callback_url`. (Use port `8000` for the FastAPI example.) Qonto also documents testing with a throwaway URL such as webhook.site before wiring your own endpoint.

## Using Hookdeck as the Source

When creating a Qonto source in Hookdeck, paste the whole secret, including the whsec_ prefix. Qonto uses it as a plain HMAC key. Hookdeck verifies `X-Qonto-Signature` (`t=`,`v1=`, hex HMAC-SHA256 of `{t}.{body}`) and applies no timestamp tolerance.

## Test Mode vs Live Mode

Qonto's webhook setup page describes no separate test mode for webhooks. Use the published test vector (see [verification.md](verification.md)) to validate your code, and a throwaway URL to confirm registration and delivery.
