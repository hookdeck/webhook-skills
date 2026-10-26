# Basin Webhooks - Next.js Example

Minimal example of receiving Basin form submission webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A Basin form on the Growth plan or above (signed webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add your signing secret (form dashboard > Integrations > Webhooks > Edit > Webhook Signing > Show) to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the endpoint is `/webhooks/basin`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 basin --path /webhooks/basin
```

The route reads `request.text()` (raw body) before parsing, so JSON and form-urlencoded payloads both verify.
