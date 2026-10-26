# Basin Webhooks - Express Example

Minimal example of receiving Basin form submission webhooks with signature verification.

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
   cp .env.example .env
   ```
3. Add your signing secret (form dashboard > Integrations > Webhooks > Edit > Webhook Signing > Show) to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 basin --path /webhooks/basin
```

Then set the Hookdeck URL as the webhook URL in Basin. The handler reads the body with
`express.raw({ type: '*/*' })` so JSON and form-urlencoded payloads both verify.
