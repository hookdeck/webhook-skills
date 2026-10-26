# Iterable Webhooks - Next.js Example

Minimal example of receiving Iterable system webhooks and authenticating them with the
`Authorization` header.

Iterable does not sign payloads. The only authentication is the `Authorization` header that
Iterable sends when you choose **Basic** or **OAuth 2.0** on the webhook:

- OAuth 2.0: `Authorization: Bearer <token>` (you enter only the token in Iterable)
- Basic: exactly what you typed in Authentication Token, e.g. `Authorization: Basic abc123`

The handler compares the **whole header value**, scheme prefix included, in constant time.
It never decodes a Basic value. A static credential authenticates the sender, not the body,
and gives no replay protection; use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 20+
- An Iterable project with permission to manage system webhooks
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ITERABLE_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/iterable`.

## Test

```bash
npm test
```

The tests send documented payload shapes with correct, wrong and missing `Authorization`
headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/iterable \
  -H "Content-Type: application/json" \
  -H "Authorization: $ITERABLE_AUTHORIZATION" \
  -d '{"email":"user@example.com","eventName":"emailSend","dataFields":{"campaignId":59667}}'
```

## Receive Iterable Webhooks Locally

```bash
npx hookdeck-cli listen 3000 iterable --path /webhooks/iterable
```

Use the printed URL as the system webhook's Endpoint URL (Iterable requires `https://`).

## How It Works

- `lib/verify-iterable.ts`: `verifyIterableRequest()`
- `app/webhooks/iterable/route.ts`: the `POST /webhooks/iterable` route

1. `Authorization` is compared with `ITERABLE_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The body is read with `request.text()` and parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. The handler switches on `eventName` (`emailSend`, `emailOpen`, `emailClick`, `emailBounce`,
   `emailComplaint`, `emailUnSubscribe`, `smsSend`, `pushSend`, `inAppOpen`, ...).
4. It returns `200 {"received": true}` quickly: Iterable times out after 2 seconds.
