# Snipcart Webhooks - Express Example

Minimal example of receiving Snipcart webhooks with **request-token validation**.

> **Snipcart does not sign webhooks.** There is no signature header, no HMAC and
> no shared webhook secret. Each request carries an `X-Snipcart-RequestToken`
> that you prove genuine by calling Snipcart's API with your **secret API key**.

## Prerequisites

- Node.js 18+ (the example uses global `fetch` and `AbortSignal.timeout`)
- A Snipcart account and its **SECRET** API key (create one in your merchant dashboard)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Put your Snipcart **secret** API key in `.env` as `SNIPCART_SECRET_API_KEY`.
   Use the key matching the mode you're testing — a Test-mode key cannot read
   Live data and vice versa.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with three routes:

| Route | Webhook |
|-------|---------|
| `POST /webhooks/snipcart` | Async events: `order.*`, `v3/subscription.*` |
| `POST /webhooks/snipcart/shipping-rates` | `shippingrates.fetch` (synchronous) |
| `POST /webhooks/snipcart/taxes` | `taxes.calculate` (synchronous) |

## Test

```bash
npm test
```

The tests stub global `fetch`, so no network access and no Snipcart account are
needed. They cover: 200 → accepted; 404 → 401; 401 from Snipcart → 401; missing
header → 401 with no outbound call; malicious tokens (`..`, `../orders`, `a/b`)
→ 401 with no outbound call; network error/timeout → 401 (fail closed); the
exact outbound URL, method, `Authorization: Basic base64(key + ":")` and
`redirect: 'manual'`; and unset key → 500.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 snipcart --path /webhooks/snipcart
```

No account required — the CLI creates a guest account and gives you a public URL
to paste into **Store Configurations → Webhooks** in the Snipcart dashboard.

Then place a test order in Test mode, or use **"Send this hook again"** on a
logged request in the dashboard.

> **Token caveat:** tokens are valid for one hour and a token that has already
> been validated returns 404. Validate on receipt, exactly once. If a gateway in
> front of you (e.g. Hookdeck's `SNIPCART` source type) already validated the
> token, do **not** validate it again here — verify the `x-hookdeck-signature`
> header instead.

> The two synchronous webhooks must point **directly** at this app. A
> store-and-forward gateway cannot return your response body to the checkout.

## How verification works

```
GET https://app.snipcart.com/api/requestvalidation/{token}
Authorization: Basic base64(SNIPCART_SECRET_API_KEY + ":")   <- trailing colon required
Accept: application/json

200  -> genuine, process the payload
404  -> unknown, already validated, or expired  -> 401
401/403 -> likely a wrong/missing/other-mode secret key -> 401
anything else, network error, timeout -> fail closed -> 401
```

The token is format-checked against `/^[A-Za-z0-9_-]{1,128}$/` **before** it is
placed in the URL: it is attacker-controlled, and `encodeURIComponent` would
leave `..` intact, which the URL parser resolves as a dot segment pointing at a
different Snipcart endpoint.

See [references/verification.md](../../references/verification.md) for the full detail.
