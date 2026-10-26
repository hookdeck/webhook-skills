# MICEtribe Webhooks - Express Example

Minimal example of receiving MICEtribe webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A MICEtribe webhook with a signing secret

> MICEtribe signs webhooks only when the webhook has a signing secret. Set one on the webhook and paste it here.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's signing secret to `.env` as `MICETRIBE_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook route is `POST /webhooks/micetribe`.

## Test

```bash
npm test
```

The tests generate real signatures (`HMAC-SHA256(secret, X-Timestamp + "." + body)`, hex). To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 micetribe --path /webhooks/micetribe
```

Use the printed Hookdeck URL as the MICEtribe webhook URL.

## Notes

- The route uses `express.raw({ type: '*/*' })` so the exact bytes are verified; JSON is parsed after the check.
- Old timestamps are not rejected by default (retries and replays keep the original `X-Timestamp`). Set `MICETRIBE_WEBHOOK_TOLERANCE_SECONDS` to opt in.
- Deliveries are deduped on `registration_id` + `meta.trigger` + `X-Request-Id` (in memory here; use a durable store in production).
