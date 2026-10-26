# Setting Up Celcoin Webhooks

## Prerequisites

- A Celcoin account with API credentials (client id and secret) for the sandbox or production
- Your application's webhook endpoint URL (HTTPS)

## Which Authentication Mode Should I Pick?

> Use Basic auth (auth.type basic) on the webhook subscription, not JWT/OAuth 2.0.

Celcoin offers two modes: Basic Auth and OAuth 2.0 (`auth.type` `jwt`, where Celcoin calls a token endpoint you host before each notification). Hookdeck's Celcoin source verifies Basic auth only. Celcoin's docs: "Neste formato o basic auth definido será enviado nas notificações" (in this format the Basic auth you define is sent with the notifications).

## Register a Subscription

1. Get an access token from the Celcoin API (`POST /v5/token`).
2. Create one subscription per `entity` you need:

```bash
curl --location --request POST 'https://sandbox.openfinance.celcoin.dev/common/v1/webhook/subscription' \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'Authorization: Bearer {{access_token}}' \
  --data '{
    "context": "PIX",
    "entity": "pix-payment-in",
    "auth": { "type": "basic", "login": "your_webhook_login", "pwd": "your_webhook_pwd" },
    "webhookUrl": "https://your-domain.com/webhooks/celcoin"
  }'
```

The BaaS product registers through `POST /baas/v2/webhook/subscription` with the same `entity`, `webhookUrl` and `auth` fields (no `context`). Use the endpoint and `context` (`PIX`, `INVOICE-NFSE`, `BAASPAY`, `SPB`) that match the product you contracted. Use the sandbox host for testing, and check the docs for the production host.

3. Put `login` and `pwd` into `CELCOIN_WEBHOOK_USERNAME` and `CELCOIN_WEBHOOK_PASSWORD`.

Other calls on the same path: `GET` (list), `PUT .../{context}/{entity}` (change the URL or credentials, or set `active`), `DELETE`. To rotate the credential, update the subscription and your environment variables together.

## Hookdeck Source

If Hookdeck sits in front of your endpoint, create a source of type **Celcoin**, and use its URL as `webhookUrl`.

- **Hookdeck never sends a 401 challenge** (no `WWW-Authenticate` round trip), so Celcoin must present the Basic credentials with each request, which is what the subscription's `auth` does.
- **Methods:** Celcoin's docs don't name the HTTP method. Hookdeck's Celcoin source pre-selects POST without managing the method, so any other method Celcoin uses must also be allowed on the source.

## Register Your Endpoint

Subscribe to the entities you handle, for example `pix-payment-in`, `pix-payment-out`, `pix-reversal-in`, `internal-transfer-in`, `spb-transfer-out`, `onboarding-proposal` and `kyc`. Registering the same entity twice returns error `CBE205`.

## Test Mode vs Live Mode

Celcoin has a sandbox host (`sandbox.openfinance.celcoin.dev`). Subscriptions are separate per environment, so register them again against production. The BaaS API can list sample payloads (`GET /baas/v2/webhook/templates`) and resend webhooks from the last 7 days.

## Local Development

```bash
npx hookdeck-cli listen 3000 celcoin --path /webhooks/celcoin
```
