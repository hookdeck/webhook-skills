# Cin7 Core Webhooks - Next.js Example

Minimal App Router example of receiving Cin7 Core webhooks and authenticating them with the Bearer or custom header configured on the webhook.

Cin7 Core does not sign payloads. The route compares the configured header with your stored value (the whole value, constant time) before reading the body as text, so any content type works.

> A static shared credential authenticates the sender, not the body, and gives no replay protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Cin7 Core webhook created with `bearerauth` or `ExternalHeaders` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `CIN7_CORE_WEBHOOK_HEADER` and `CIN7_CORE_WEBHOOK_SECRET` (the exact whole header value, e.g. `Bearer <token>`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/cin7-core`.

## Test

```bash
npm test
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 cin7-core --path /webhooks/cin7-core
```

Put the printed URL in the Cin7 Core webhook.

## How It Works

- `lib/verify-cin7-core.ts`: `verifyCin7CoreRequest()`
- `app/webhooks/cin7-core/route.ts`: authenticates (`401` on failure), parses a JSON object (`400` otherwise), dispatches on `EventType` (`Sale/Created`, `Sale/OrderAuthorised`, `Sale/ShipmentAuthorised`, `Purchase/OrderAuthorised`, `Product/Updated`) and returns `200`.
